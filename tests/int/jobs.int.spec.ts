import { getPayload, Payload, PayloadRequest } from 'payload'
import config from '@/payload.config'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as checkoutPost } from '@/app/(frontend)/api/checkout/route'
import { drizzleFor } from '@/lib/commerce/db'
import { confirmOrder, shipOrder } from '@/lib/commerce/orderActions'
import { markPaid } from '@/lib/commerce/payments'
import { computeCheckout } from '@/lib/commerce/quote'
import { mockShiprocket } from '@/lib/integrations/shiprocket/mock'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'
import { expirePendingPayments, expireUnconfirmedCod } from '@/jobs/expire'
import { runJobsNowEndpoint } from '@/jobs'
import { pollShipmentStatus } from '@/jobs/pollShipments'
import { seed, wipe } from '@/seed'

type Line = { productId: number; variantId: string }

let payload: Payload
let sand: Line
let initialStock: Record<string, number>

let seq = 0
const nextIp = () => `10.92.${Math.floor(seq / 250)}.${(seq % 250) + 1}`
const nextPhone = () => `98765${String(80000 + seq).padStart(5, '0')}`

const stockOf = async (line: Line) => {
  const db = await drizzleFor(payload)
  const r = await db.execute(sql`SELECT stock::int AS stock FROM products_variants WHERE id = ${line.variantId}`)
  return Number(r.rows[0]!.stock)
}

async function place(paymentMethod: 'cod' | 'prepaid') {
  seq++
  const phone = nextPhone()
  const items = [{ ...sand, qty: 1 }]
  const { quote } = await computeCheckout(payload, { items, pincode: '226001', paymentMethod, phone }, 'order')
  const res = await checkoutPost(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
      body: JSON.stringify({
        name: 'Asha Verma',
        phone,
        email: '',
        line1: '12 MG Road',
        line2: '',
        landmark: '',
        pincode: '226001',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        items,
        paymentMethod,
        discountCode: '',
        turnstileToken: MOCK_TURNSTILE_TOKEN,
        honeypot: '',
        idempotencyKey: crypto.randomUUID(),
        expectedTotal: quote.totals.total,
      }),
    }),
  )
  expect(res.status).toBe(201)
  return (
    await payload.find({ collection: 'orders', where: { 'customer.phone': { equals: phone } }, limit: 1, depth: 0 })
  ).docs[0]!
}

const reload = (id: number) => payload.findByID({ collection: 'orders', id, depth: 0 })

async function backdate(id: number, interval: string) {
  const db = await drizzleFor(payload)
  await db.execute(sql`UPDATE orders SET created_at = now() - ${interval}::interval WHERE id = ${id}`)
}

const callRunJobs = (user: unknown, body: unknown) =>
  runJobsNowEndpoint.handler({
    payload,
    user,
    json: async () => body,
  } as unknown as PayloadRequest)

describe('scheduled jobs and the run-now tool', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
    const container = (
      await payload.find({
        collection: 'products',
        where: { slug: { equals: 'mexico-premium-container-set-of-2' } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]!
    sand = { productId: container.id, variantId: container.variants.find((v) => v.name === 'Sand')!.id as string }
    initialStock = { [sand.variantId]: await stockOf(sand) }
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    const db = await drizzleFor(payload)
    for (const [id, stock] of Object.entries(initialStock)) {
      await db.execute(sql`UPDATE products_variants SET stock = ${stock} WHERE id = ${id}`)
    }
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('cancels an unpaid prepaid order past the deadline, restores its stock and leaves a younger one alone', async () => {
    const before = await stockOf(sand)
    const old = await place('prepaid')
    const young = await place('prepaid')
    expect(await stockOf(sand)).toBe(before - 2)
    await backdate(old.id, '31 minutes')
    await backdate(young.id, '29 minutes')

    const cancelled = await expirePendingPayments(payload, new Date())

    expect(cancelled).toEqual([old.orderNumber])
    const oldAfter = await reload(old.id)
    expect(oldAfter.status).toBe('cancelled')
    expect(oldAfter.timeline?.at(-1)).toMatchObject({ status: 'cancelled', by: 'system', note: 'Payment not received in time' })
    expect((await reload(young.id)).status).toBe('pending_payment')
    expect(await stockOf(sand)).toBe(before - 1)
  })

  it('cancels an unconfirmed COD order past the deadline and leaves a younger one alone', async () => {
    const old = await place('cod')
    const young = await place('cod')
    await backdate(old.id, '25 hours')
    await backdate(young.id, '23 hours')

    const cancelled = await expireUnconfirmedCod(payload, new Date())

    expect(cancelled).toEqual([old.orderNumber])
    const oldAfter = await reload(old.id)
    expect(oldAfter.status).toBe('cancelled')
    expect(oldAfter.timeline?.at(-1)).toMatchObject({ by: 'system', note: 'Not confirmed in time' })
    expect((await reload(young.id)).status).toBe('awaiting_confirmation')
  })

  it('leaves an order alone that was paid after the expiry query ran', async () => {
    const order = await place('prepaid')
    await backdate(order.id, '31 minutes')
    const stale = await payload.find({
      collection: 'orders',
      where: { id: { equals: order.id } },
      pagination: false,
      depth: 0,
    })
    expect(stale.docs[0]!.status).toBe('pending_payment')
    await markPaid(payload, { razorpayOrderId: order.razorpay!.orderId as string, paymentId: 'pay_jobs_race' })
    vi.spyOn(payload, 'find').mockResolvedValueOnce(stale)

    const cancelled = await expirePendingPayments(payload, new Date())

    expect(cancelled).toEqual([])
    expect((await reload(order.id)).status).toBe('confirmed')
  })

  it('does not cancel an order that is paid and past its deadline', async () => {
    const order = await place('prepaid')
    await markPaid(payload, { razorpayOrderId: order.razorpay!.orderId as string, paymentId: 'pay_jobs_paid' })
    await backdate(order.id, '2 hours')

    expect(await expirePendingPayments(payload, new Date())).toEqual([])
    expect((await reload(order.id)).status).toBe('confirmed')
  })

  it('delivers a shipped order when the courier poll reports it delivered', async () => {
    const order = await place('cod')
    await confirmOrder(payload, order.id)
    expect((await shipOrder(payload, order.id)).ok).toBe(true)
    const booked = await reload(order.id)
    const awb = booked.shipment!.awb as string
    const spy = vi
      .spyOn(mockShiprocket, 'trackAwb')
      .mockResolvedValue({ status: 'DELIVERED', at: new Date().toISOString() })

    const applied = await pollShipmentStatus(payload)

    expect(spy).toHaveBeenCalledWith(awb)
    expect(applied).toBeGreaterThanOrEqual(1)
    expect((await reload(order.id)).status).toBe('delivered')
  })

  it('rejects the run-jobs endpoint without a user', async () => {
    const res = await callRunJobs(undefined, {})
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('runs the jobs ahead of time for an admin and cancels a fresh pending order', async () => {
    const order = await place('prepaid')
    const none = await callRunJobs({ id: 1 }, {})
    expect(none.status).toBe(200)
    expect((await none.json()).cancelled).not.toContain(order.orderNumber)
    expect((await reload(order.id)).status).toBe('pending_payment')

    const res = await callRunJobs({ id: 1 }, { aheadMinutes: 60 })

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.cancelled).toContain(order.orderNumber)
    expect(typeof body.polled).toBe('number')
    expect((await reload(order.id)).status).toBe('cancelled')
  })

  it('hides the run-jobs endpoint in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await callRunJobs({ id: 1 }, {})
    vi.unstubAllEnvs()
    expect(res.status).toBe(404)
  })
})
