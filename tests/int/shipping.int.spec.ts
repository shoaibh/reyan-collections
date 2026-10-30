import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as checkoutPost } from '@/app/(frontend)/api/checkout/route'
import { POST as shiprocketWebhookPost } from '@/app/(frontend)/api/webhooks/shiprocket/route'
import { drizzleFor } from '@/lib/commerce/db'
import { financialYear } from '@/lib/commerce/invoice'
import { applyCourierEvent, parseCourierTime, confirmOrder, shipOrder } from '@/lib/commerce/orderActions'
import { markPaid } from '@/lib/commerce/payments'
import { computeCheckout } from '@/lib/commerce/quote'
import { MOCK_SHIPROCKET_WEBHOOK_TOKEN } from '@/lib/integrations/shiprocket'
import { mockShiprocket } from '@/lib/integrations/shiprocket/mock'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'
import { seed, wipe } from '@/seed'

type Line = { productId: number; variantId: string }

let payload: Payload
let sand: Line
let initialStock: Record<string, number>
let fy: string

let seq = 0
const nextIp = () => `10.91.${Math.floor(seq / 250)}.${(seq % 250) + 1}`
const nextPhone = () => `98765${String(70000 + seq).padStart(5, '0')}`

const stockOf = async (line: Line) => {
  const db = await drizzleFor(payload)
  const r = await db.execute(sql`SELECT stock::int AS stock FROM products_variants WHERE id = ${line.variantId}`)
  return Number(r.rows[0]!.stock)
}

async function place(paymentMethod: 'cod' | 'prepaid', phoneOverride?: string) {
  seq++
  const phone = phoneOverride ?? nextPhone()
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

async function confirmed(method: 'cod' | 'prepaid', phone?: string) {
  const order = await place(method, phone)
  if (method === 'cod') {
    await confirmOrder(payload, order.id)
  } else {
    await markPaid(payload, { razorpayOrderId: order.razorpay!.orderId as string, paymentId: `pay_ship_${seq}` })
  }
  const fresh = await reload(order.id)
  expect(fresh.status).toBe('confirmed')
  return fresh
}

async function shipped(method: 'cod' | 'prepaid', phone?: string) {
  const order = await confirmed(method, phone)
  const res = await shipOrder(payload, order.id)
  expect(res.ok).toBe(true)
  return reload(order.id)
}

const event = (awb: string, rawStatus: string, at = new Date().toISOString()) =>
  applyCourierEvent(payload, { awb, rawStatus, at, raw: { current_status: rawStatus }, source: 'webhook' })

const webhook = (body: unknown, token: string | null) =>
  shiprocketWebhookPost(
    new Request('http://localhost/api/webhooks/shiprocket', {
      method: 'POST',
      headers: token === null ? {} : { 'x-api-key': token },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )

describe('shipping and courier events', () => {
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
    fy = financialYear(new Date())
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

  it('ships a confirmed order with an AWB and the first invoice number, and a second ship is a no-op', async () => {
    const order = await confirmed('prepaid')
    const first = await shipOrder(payload, order.id)
    expect(first).toMatchObject({ ok: true, changed: true })
    const after = await reload(order.id)
    expect(after.status).toBe('ready_to_ship')
    expect(after.shipment?.awb).toMatch(/^MOCKAWB\d{10}$/)
    expect(after.shipment?.courierName).toBe('Mock Express')
    expect(after.invoice?.number).toBe(`RC/${fy}/0001`)
    expect(after.timeline?.at(-1)?.note).toBe(`Booked with Mock Express · AWB ${after.shipment?.awb}`)

    const second = await shipOrder(payload, order.id)
    expect(second).toMatchObject({ ok: true, changed: false })
    expect((await reload(order.id)).shipment?.awb).toBe(after.shipment?.awb)
  })

  it('books once for two concurrent ships, and the next order gets invoice 0002', async () => {
    const spy = vi.spyOn(mockShiprocket, 'bookShipment')
    const order = await confirmed('cod')
    const [a, b] = await Promise.all([shipOrder(payload, order.id), shipOrder(payload, order.id)])
    expect([a.ok, b.ok]).toEqual([true, true])
    expect([a, b].filter((r) => r.ok && r.changed)).toHaveLength(1)
    expect(spy).toHaveBeenCalledTimes(1)
    const after = await reload(order.id)
    expect(after.invoice?.number).toBe(`RC/${fy}/0002`)

    const next = await confirmed('prepaid')
    await shipOrder(payload, next.id)
    expect((await reload(next.id)).invoice?.number).toBe(`RC/${fy}/0003`)
  })

  it('answers 502 when booking fails, keeps the order confirmed and leaves no gap in invoice numbers', async () => {
    const order = await confirmed('prepaid')
    vi.spyOn(mockShiprocket, 'bookShipment').mockRejectedValueOnce(new Error('down'))
    const failed = await shipOrder(payload, order.id)
    expect(failed).toEqual({ ok: false, status: 502, error: "Shiprocket couldn't book this order. Please try again." })
    const same = await reload(order.id)
    expect(same.status).toBe('confirmed')
    expect(same.invoice?.number).toBeFalsy()

    const retry = await shipOrder(payload, order.id)
    expect(retry).toMatchObject({ ok: true, changed: true })
    expect((await reload(order.id)).invoice?.number).toBe(`RC/${fy}/0004`)
  })

  it('records each booking warning as a system timeline note', async () => {
    vi.spyOn(mockShiprocket, 'bookShipment').mockImplementationOnce(async () => ({
      shiprocketOrderId: 'MOCKSO1',
      shipmentId: 'MOCKSH1',
      awb: 'MOCKAWB0000000001',
      courierName: 'Mock Express',
      labelUrl: null,
      trackingUrl: 'https://shiprocket.co/tracking/x',
      warnings: ['Pickup not scheduled'],
    }))
    const order = await confirmed('prepaid')
    await shipOrder(payload, order.id)
    const note = (await reload(order.id)).timeline?.find((t) => t.note === 'Pickup not scheduled')
    expect(note).toMatchObject({ by: 'system' })
  })

  it('rejects a webhook with a bad token and bad bodies', async () => {
    expect((await webhook({ awb: 'X', current_status: 'DELIVERED' }, 'wrong')).status).toBe(401)
    expect((await webhook({ awb: 'X', current_status: 'DELIVERED' }, null)).status).toBe(401)
    expect((await webhook('not json', MOCK_SHIPROCKET_WEBHOOK_TOKEN)).status).toBe(400)
    expect((await webhook({ current_status: 'DELIVERED' }, MOCK_SHIPROCKET_WEBHOOK_TOKEN)).status).toBe(400)
    expect((await webhook({ awb: 'UNKNOWN', current_status: 'DELIVERED' }, MOCK_SHIPROCKET_WEBHOOK_TOKEN)).status).toBe(200)
  })

  it('moves a COD order to shipped then delivered by webhook, collects cash, and ignores duplicates and late events', async () => {
    const order = await shipped('cod')
    const awb = order.shipment!.awb as string
    const at = '2026-10-30T10:00:00.000Z'

    const picked = await webhook({ awb, current_status: 'PICKED UP', current_timestamp: '2026-10-30T08:00:00.000Z' }, MOCK_SHIPROCKET_WEBHOOK_TOKEN)
    expect(picked.status).toBe(200)
    expect((await reload(order.id)).status).toBe('shipped')

    await webhook({ awb, current_status: 'DELIVERED', current_timestamp: at }, MOCK_SHIPROCKET_WEBHOOK_TOKEN)
    const delivered = await reload(order.id)
    expect(delivered.status).toBe('delivered')
    expect(delivered.paymentStatus).toBe('cod_collected')

    await webhook({ awb, current_status: 'DELIVERED', current_timestamp: at }, MOCK_SHIPROCKET_WEBHOOK_TOKEN)
    const dup = (await reload(order.id)).shipment?.events?.filter((e) => e.status === 'DELIVERED') ?? []
    expect(dup).toHaveLength(1)

    await event(awb, 'IN TRANSIT', '2026-10-30T11:00:00.000Z')
    const late = await reload(order.id)
    expect(late.status).toBe('delivered')
    expect(late.shipment?.events?.some((e) => e.status === 'IN TRANSIT')).toBe(true)
  })

  it('walks shipped then delivered when DELIVERED arrives while ready to ship', async () => {
    const order = await shipped('prepaid')
    expect(order.status).toBe('ready_to_ship')
    const { applied } = await event(order.shipment!.awb as string, 'DELIVERED')
    expect(applied).toEqual(['shipped', 'delivered'])
    const after = await reload(order.id)
    expect(after.status).toBe('delivered')
    expect(after.paymentStatus).toBe('paid')
    expect(after.timeline?.filter((t) => t.note === 'Courier: DELIVERED').map((t) => t.status)).toEqual(['shipped', 'delivered'])
  })

  it('blocklists the phone on a COD RTO without releasing stock, tolerates a repeat, and skips prepaid', async () => {
    const before = await stockOf(sand)
    const phone = nextPhone()
    const first = await shipped('cod', phone)
    const afterPlace = await stockOf(sand)
    expect(afterPlace).toBe(before - 1)
    await event(first.shipment!.awb as string, 'RTO INITIATED')
    const rto = await reload(first.id)
    expect(rto.status).toBe('rto')
    expect(rto.codBlocklisted).toBe(true)
    expect(rto.creditNote?.needed).toBe(true)
    expect(await stockOf(sand)).toBe(afterPlace)
    const listed = await payload.find({ collection: 'cod-blocklist', where: { phone: { equals: phone } }, limit: 5 })
    expect(listed.docs).toHaveLength(1)
    expect(listed.docs[0]!.reason).toBe(`Refused at the door (${first.orderNumber})`)

    // the blocklist now stops a second COD order for this phone at checkout, so seed the repeat directly
    const second = await shipped('cod')
    await payload.update({
      collection: 'orders',
      id: second.id,
      depth: 0,
      data: { customer: { ...second.customer, phone } },
    })
    await event(second.shipment!.awb as string, 'RTO DELIVERED')
    expect((await reload(second.id)).status).toBe('rto')
    const still = await payload.find({ collection: 'cod-blocklist', where: { phone: { equals: phone } }, limit: 5 })
    expect(still.docs).toHaveLength(1)

    const prepaid = await shipped('prepaid')
    await event(prepaid.shipment!.awb as string, 'RTO INITIATED')
    const p = await reload(prepaid.id)
    expect(p.status).toBe('rto')
    expect(p.codBlocklisted).toBeFalsy()
    const none = await payload.find({
      collection: 'cod-blocklist',
      where: { phone: { equals: prepaid.customer!.phone as string } },
      limit: 5,
    })
    expect(none.docs).toHaveLength(0)
  })

  it('keeps one blocklist entry and still reaches rto when the phone is already listed', async () => {
    const phone = nextPhone()
    const order = await shipped('cod', phone)
    await payload.create({ collection: 'cod-blocklist', data: { phone, reason: 'Manual' }, depth: 0 })
    await event(order.shipment!.awb as string, 'RTO INITIATED')
    const after = await reload(order.id)
    expect(after.status).toBe('rto')
    expect(after.codBlocklisted).toBe(true)
    const listed = await payload.find({ collection: 'cod-blocklist', where: { phone: { equals: phone } }, limit: 5 })
    expect(listed.docs).toHaveLength(1)
    expect(listed.docs[0]!.reason).toBe('Manual')
  })

  it('reads a zoneless Shiprocket timestamp as IST', () => {
    expect(parseCourierTime('2026-10-30 14:05:00')).toBe('2026-10-30T08:35:00.000Z')
    expect(parseCourierTime('2026-10-30T08:35:00.000Z')).toBe('2026-10-30T08:35:00.000Z')
    expect(parseCourierTime('garbage')).toBeNull()
  })

  it('records a retried webhook with a zoneless timestamp once', async () => {
    const order = await shipped('prepaid')
    const awb = order.shipment!.awb as string
    const body = { awb, current_status: 'PICKED UP', current_timestamp: '2026-10-30 14:05:00' }
    await webhook(body, MOCK_SHIPROCKET_WEBHOOK_TOKEN)
    await webhook(body, MOCK_SHIPROCKET_WEBHOOK_TOKEN)
    const events = (await reload(order.id)).shipment?.events ?? []
    expect(events).toHaveLength(1)
    expect(new Date(events[0]!.at as string).toISOString()).toBe('2026-10-30T08:35:00.000Z')
  })

  it('moves a shipped order to out for delivery on OUT FOR DELIVERY', async () => {
    const order = await shipped('prepaid')
    const awb = order.shipment!.awb as string
    await event(awb, 'PICKED UP', '2026-10-30T08:00:00.000Z')
    expect((await reload(order.id)).status).toBe('shipped')
    const { applied } = await event(awb, 'OUT FOR DELIVERY', '2026-10-30T09:00:00.000Z')
    expect(applied).toEqual(['out_for_delivery'])
    expect((await reload(order.id)).status).toBe('out_for_delivery')
  })

  it('moves an out-for-delivery order to rto on RTO INITIATED', async () => {
    const order = await shipped('prepaid')
    const awb = order.shipment!.awb as string
    await event(awb, 'OUT FOR DELIVERY', '2026-10-30T09:00:00.000Z')
    expect((await reload(order.id)).status).toBe('out_for_delivery')
    const { applied } = await event(awb, 'RTO INITIATED', '2026-10-30T12:00:00.000Z')
    expect(applied).toEqual(['rto'])
    expect((await reload(order.id)).status).toBe('rto')
  })
})
