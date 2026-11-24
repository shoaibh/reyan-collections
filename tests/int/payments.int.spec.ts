import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { POST as checkoutPost } from '@/app/(frontend)/api/checkout/route'
import { POST as verifyPost } from '@/app/(frontend)/api/checkout/verify/route'
import { POST as webhookPost } from '@/app/(frontend)/api/webhooks/razorpay/route'
import { drizzleFor } from '@/lib/commerce/db'
import { cancelPendingOrder } from '@/lib/commerce/orderOps'
import { handleRazorpayWebhook, markPaid, recordPaymentFailure } from '@/lib/commerce/payments'
import { computeCheckout } from '@/lib/commerce/quote'
import { MOCK_RAZORPAY } from '@/lib/integrations/razorpay/mock'
import { hmacHex } from '@/lib/integrations/razorpay/signature'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'
import { seed, wipe } from '@/seed'

type Line = { productId: number; variantId: string }

let payload: Payload
let sand: Line
let initialStock: Record<string, number>

let seq = 0
const nextIp = () => `10.80.${Math.floor(seq / 250)}.${(seq % 250) + 1}`
const nextPhone = () => `98765${String(80000 + seq).padStart(5, '0')}`

const stockOf = async (line: Line) => {
  const db = await drizzleFor(payload)
  const r = await db.execute(sql`SELECT stock::int AS stock FROM products_variants WHERE id = ${line.variantId}`)
  return Number(r.rows[0]!.stock)
}

/** Places a prepaid order for 1 unit through the checkout route. */
async function placePrepaid() {
  seq++
  const phone = nextPhone()
  const items = [{ ...sand, qty: 1 }]
  const { quote } = await computeCheckout(
    payload,
    { items, pincode: '226001', paymentMethod: 'prepaid', phone },
    'order',
  )
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
        paymentMethod: 'prepaid',
        discountCode: '',
        turnstileToken: MOCK_TURNSTILE_TOKEN,
        honeypot: '',
        idempotencyKey: crypto.randomUUID(),
        expectedTotal: quote.totals.total,
      }),
    }),
  )
  expect(res.status).toBe(201)
  const json = (await res.json()) as { orderNumber: string }
  const order = (
    await payload.find({ collection: 'orders', where: { orderNumber: { equals: json.orderNumber } }, limit: 1, depth: 0 })
  ).docs[0]!
  return { order, razorpayOrderId: order.razorpay!.orderId as string }
}

const reload = async (id: number) => payload.findByID({ collection: 'orders', id, depth: 0 })

const verifyReq = (orderId: string, paymentId: string, signature?: string) =>
  verifyPost(
    new Request('http://localhost/api/checkout/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature ?? hmacHex(MOCK_RAZORPAY.keySecret, `${orderId}|${paymentId}`),
      }),
    }),
  )

const webhookReq = (body: unknown, signature?: string) => {
  const raw = JSON.stringify(body)
  return webhookPost(
    new Request('http://localhost/api/webhooks/razorpay', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-razorpay-signature': signature ?? hmacHex(MOCK_RAZORPAY.webhookSecret, raw),
      },
      body: raw,
    }),
  )
}

const paidEvent = (orderId: string, paymentId: string) => ({
  event: 'order.paid',
  payload: { payment: { entity: { id: paymentId, order_id: orderId } }, order: { entity: { id: orderId } } },
})

const failedEvent = (orderId: string, paymentId: string) => ({
  event: 'payment.failed',
  payload: { payment: { entity: { id: paymentId, order_id: orderId, error_description: 'Card declined' } } },
})

const notes = (o: { timeline?: { note?: string | null }[] | null }, note: string) =>
  (o.timeline ?? []).filter((t) => t.note === note).length

describe('payments', () => {
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
    const db = await drizzleFor(payload)
    for (const [id, stock] of Object.entries(initialStock)) {
      await db.execute(sql`UPDATE products_variants SET stock = ${stock} WHERE id = ${id}`)
    }
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('verify with a valid signature confirms the order and returns its url', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    const res = await verifyReq(razorpayOrderId, 'pay_verify_1')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { url: string }
    expect(json.url).toContain('/order/RC')
    expect(json.url).toBe(`/order/${order.orderNumber}?t=${order.accessToken}`)
    const after = await reload(order.id)
    expect(after).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      razorpay: { paymentId: 'pay_verify_1' },
    })
    expect(notes(after, 'Payment received')).toBe(1)
  })

  it('verify with a bad signature gives 400 and leaves the order pending', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    const res = await verifyReq(razorpayOrderId, 'pay_bad_1', 'deadbeef')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Payment could not be verified' })
    expect((await reload(order.id)).status).toBe('pending_payment')
  })

  it('verify for an unknown razorpay order gives 404', async () => {
    const res = await verifyReq('order_mock_doesnotexist', 'pay_unknown_1')
    expect(res.status).toBe(404)
  })

  it('verify then the webhook for the same payment leaves one Payment received entry', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    expect((await verifyReq(razorpayOrderId, 'pay_dup_1')).status).toBe(200)
    expect((await webhookReq(paidEvent(razorpayOrderId, 'pay_dup_1'))).status).toBe(200)
    const after = await reload(order.id)
    expect(after.status).toBe('confirmed')
    expect(notes(after, 'Payment received')).toBe(1)
  })

  it('the webhook alone confirms the order', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    expect((await webhookReq(paidEvent(razorpayOrderId, 'pay_hook_1'))).status).toBe(200)
    expect(await reload(order.id)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' })
  })

  it('a bad webhook signature gives 400 and changes nothing', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    const res = await webhookReq(paidEvent(razorpayOrderId, 'pay_hook_2'), 'deadbeef')
    expect(res.status).toBe(400)
    expect((await reload(order.id)).status).toBe('pending_payment')
  })

  it('a webhook with bad JSON gives 400', async () => {
    const raw = 'not json'
    const bad = await webhookPost(
      new Request('http://localhost/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'x-razorpay-signature': hmacHex(MOCK_RAZORPAY.webhookSecret, raw) },
        body: raw,
      }),
    )
    expect(bad.status).toBe(400)
  })

  it('a webhook for an unrelated event gives 200', async () => {
    expect((await webhookReq({ event: 'refund.processed', payload: {} })).status).toBe(200)
  })

  it('verify and the webhook racing for the same payment confirm the order once', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    const [v, w] = await Promise.all([
      verifyReq(razorpayOrderId, 'pay_race_1'),
      webhookReq(paidEvent(razorpayOrderId, 'pay_race_1')),
    ])
    expect(v.status).toBe(200)
    expect(w.status).toBe(200)
    const after = await reload(order.id)
    expect(after).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' })
    expect(notes(after, 'Payment received')).toBe(1)
  })

  it('a late payment re-reserves stock when it is available', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    const before = await stockOf(sand)
    await cancelPendingOrder(payload, order.id, 'Payment window expired')
    expect(await stockOf(sand)).toBe(before + 1)

    const result = await markPaid(payload, { razorpayOrderId, paymentId: 'pay_late_1' })
    expect(result.outcome).toBe('late_confirmed')
    expect(await stockOf(sand)).toBe(before)
    const after = await reload(order.id)
    expect(after).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' })
    expect(notes(after, 'Paid after expiry; stock re-reserved')).toBe(1)
  })

  it('a late payment with no stock left is refunded', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    await cancelPendingOrder(payload, order.id, 'Payment window expired')
    const db = await drizzleFor(payload)
    await db.execute(sql`UPDATE products_variants SET stock = 0 WHERE id = ${sand.variantId}`)

    const result = await markPaid(payload, { razorpayOrderId, paymentId: 'pay_late_2' })
    expect(result.outcome).toBe('late_refunded')
    const after = await reload(order.id)
    expect(after.status).toBe('cancelled')
    expect(after.paymentStatus).toBe('refunded')
    expect(after.razorpay?.paymentId).toBe('pay_late_2')
    expect(after.razorpay?.refundId).toMatch(/^rfnd_mock_/)
    expect(after.alert?.message).toBe('Paid after expiry, refunded')
    expect(notes(after, 'Paid after expiry; refunded (out of stock)')).toBe(1)
    expect(await stockOf(sand)).toBe(0)

    const again = await markPaid(payload, { razorpayOrderId, paymentId: 'pay_late_2' })
    expect(again.outcome).toBe('already_paid')
  })

  it('markPaid reports unknown_order for an unknown razorpay order', async () => {
    const result = await markPaid(payload, { razorpayOrderId: 'order_mock_nope', paymentId: 'pay_x' })
    expect(result).toEqual({ outcome: 'unknown_order', order: null })
  })

  it('payment.failed appends Payment failed once, even when delivered twice', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    expect((await webhookReq(failedEvent(razorpayOrderId, 'pay_x'))).status).toBe(200)
    expect((await webhookReq(failedEvent(razorpayOrderId, 'pay_x'))).status).toBe(200)
    const after = await reload(order.id)
    expect(after.status).toBe('pending_payment')
    expect(notes(after, 'Payment failed (pay_x)')).toBe(1)
  })

  it('recordPaymentFailure ignores orders that are no longer pending', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    await markPaid(payload, { razorpayOrderId, paymentId: 'pay_ok_1' })
    await recordPaymentFailure(payload, { razorpayOrderId, paymentId: null, reason: 'Test payment failed' })
    expect(notes(await reload(order.id), 'Payment failed')).toBe(0)
  })

  it('handleRazorpayWebhook returns 500 when the late refund throws', async () => {
    const { order, razorpayOrderId } = await placePrepaid()
    await cancelPendingOrder(payload, order.id, 'Payment window expired')
    const db = await drizzleFor(payload)
    await db.execute(sql`UPDATE products_variants SET stock = 0 WHERE id = ${sand.variantId}`)
    const { mockRazorpay } = await import('@/lib/integrations/razorpay/mock')
    const original = mockRazorpay.refund
    mockRazorpay.refund = async () => {
      throw new Error('refund down')
    }
    try {
      const raw = JSON.stringify(paidEvent(razorpayOrderId, 'pay_late_3'))
      const out = await handleRazorpayWebhook(payload, raw, hmacHex(MOCK_RAZORPAY.webhookSecret, raw))
      expect(out.status).toBe(500)
    } finally {
      mockRazorpay.refund = original
    }
    expect(await reload(order.id)).toMatchObject({ status: 'cancelled', paymentStatus: 'unpaid' })
  })
})
