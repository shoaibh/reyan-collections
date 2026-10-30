import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as checkoutPost } from '@/app/(frontend)/api/checkout/route'
import { drizzleFor } from '@/lib/commerce/db'
import {
  cancelOrder,
  confirmOrder,
  handleAlert,
  markDelivered,
  markReturned,
  restockOrder,
} from '@/lib/commerce/orderActions'
import { markPaid } from '@/lib/commerce/payments'
import { computeCheckout } from '@/lib/commerce/quote'
import { cancelPendingOrder } from '@/lib/commerce/orderOps'
import { mockRazorpay } from '@/lib/integrations/razorpay/mock'
import { mockShiprocket } from '@/lib/integrations/shiprocket/mock'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'
import { seed, wipe } from '@/seed'

type Line = { productId: number; variantId: string }

let payload: Payload
let sand: Line
let initialStock: Record<string, number>

let seq = 0
const nextIp = () => `10.90.${Math.floor(seq / 250)}.${(seq % 250) + 1}`
const nextPhone = () => `98765${String(90000 + seq).padStart(5, '0')}`

const stockOf = async (line: Line) => {
  const db = await drizzleFor(payload)
  const r = await db.execute(sql`SELECT stock::int AS stock FROM products_variants WHERE id = ${line.variantId}`)
  return Number(r.rows[0]!.stock)
}

async function place(paymentMethod: 'cod' | 'prepaid', email = '', expectedStatus = 201) {
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
        email,
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
  expect(res.status).toBe(expectedStatus)
  return (
    await payload.find({ collection: 'orders', where: { 'customer.phone': { equals: phone } }, limit: 1, depth: 0 })
  ).docs[0]!
}

async function placePaid(email = '') {
  const order = await place('prepaid', email)
  await markPaid(payload, { razorpayOrderId: order.razorpay!.orderId as string, paymentId: `pay_act_${seq}` })
  return (await reload(order.id))
}

const setStock = async (line: Line, stock: number) => {
  const db = await drizzleFor(payload)
  await db.execute(sql`UPDATE products_variants SET stock = ${stock} WHERE id = ${line.variantId}`)
}
const reload = (id: number) => payload.findByID({ collection: 'orders', id, depth: 0 })
const setStatus = (id: number, status: string) =>
  payload.update({ collection: 'orders', id, depth: 0, data: { status } as never })
const emails = (orderNumber: string) =>
  payload.find({ collection: 'dev-emails', where: { orderNumber: { equals: orderNumber } }, limit: 20 })
const setBusinessEmail = (email: string | null) =>
  payload.updateGlobal({ slug: 'store-settings', data: { business: { email } } as never })

describe('order actions', () => {
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
    await setBusinessEmail(null)
    await wipe(payload)
  })

  it('confirms a COD order once, is a no-op the second time, and emails the customer', async () => {
    const order = await place('cod', 'asha@example.com')
    const first = await confirmOrder(payload, order.id)
    expect(first).toMatchObject({ ok: true, changed: true })
    expect((await reload(order.id)).status).toBe('confirmed')
    const second = await confirmOrder(payload, order.id)
    expect(second).toMatchObject({ ok: true, changed: false })
    const sent = (await emails(order.orderNumber)).docs.filter((e) => e.tag === 'cod_confirmed')
    expect(sent).toHaveLength(1)
  })

  it('refuses to confirm an order that is not awaiting confirmation', async () => {
    const order = await place('prepaid')
    const res = await confirmOrder(payload, order.id)
    expect(res).toEqual({ ok: false, status: 409, error: "This order can't be confirmed from Payment pending." })
  })

  it('cancels a paid prepaid order with one refund, restores stock and survives a concurrent double cancel', async () => {
    const order = await placePaid()
    const before = await stockOf(sand)
    const refund = vi.spyOn(mockRazorpay, 'refund')
    const results = await Promise.all([
      cancelOrder(payload, order.id, { by: 'admin', note: 'Cancelled by admin' }),
      cancelOrder(payload, order.id, { by: 'admin', note: 'Cancelled by admin' }),
    ])
    expect(results.every((r) => r.ok)).toBe(true)
    expect(results.filter((r) => r.ok && r.changed)).toHaveLength(1)
    expect(refund).toHaveBeenCalledTimes(1)
    const after = await reload(order.id)
    expect(after).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' })
    expect(after.razorpay?.refundId).toMatch(/^rfnd_mock_/)
    expect(await stockOf(sand)).toBe(before + 1)
  })

  it('cancels an unpaid order without calling the refund API', async () => {
    const order = await place('prepaid')
    const refund = vi.spyOn(mockRazorpay, 'refund')
    const res = await cancelOrder(payload, order.id, { by: 'admin', note: 'Cancelled by admin' })
    expect(res).toMatchObject({ ok: true, changed: true })
    expect(refund).not.toHaveBeenCalled()
    expect((await reload(order.id)).status).toBe('cancelled')
  })

  it('refuses to cancel a delivered order', async () => {
    const order = await place('cod')
    await setStatus(order.id, 'delivered')
    const res = await cancelOrder(payload, order.id, { by: 'admin', note: 'x' })
    expect(res).toEqual({ ok: false, status: 409, error: "This order can't be cancelled from Delivered." })
  })

  it('marks a COD order delivered and collected', async () => {
    const order = await place('cod')
    await setStatus(order.id, 'shipped')
    const res = await markDelivered(payload, order.id, { by: 'admin' })
    expect(res).toMatchObject({ ok: true, changed: true })
    expect(await reload(order.id)).toMatchObject({ status: 'delivered', paymentStatus: 'cod_collected' })
    expect(await markDelivered(payload, order.id, { by: 'admin' })).toMatchObject({ ok: true, changed: false })
  })

  it('needs a refund note to return a COD order, then restocks and returns it', async () => {
    const order = await place('cod')
    await setStatus(order.id, 'delivered')
    const refused = await markReturned(payload, order.id, { restock: true })
    expect(refused).toEqual({ ok: false, status: 400, error: 'Add a note about the cash refund' })
    const before = await stockOf(sand)
    const res = await markReturned(payload, order.id, { restock: true, refundNote: 'Refunded Rs 549 by UPI' })
    expect(res).toMatchObject({ ok: true, changed: true })
    expect(await reload(order.id)).toMatchObject({
      status: 'returned',
      restocked: true,
      refundNote: 'Refunded Rs 549 by UPI',
    })
    expect(await stockOf(sand)).toBe(before + 1)
  })

  it('refunds a prepaid order once on return and flags a credit note when invoiced', async () => {
    const order = await placePaid()
    await payload.update({
      collection: 'orders',
      id: order.id,
      depth: 0,
      data: { status: 'delivered', invoice: { number: 'RC/26-27/0001' } } as never,
    })
    const refund = vi.spyOn(mockRazorpay, 'refund')
    const res = await markReturned(payload, order.id, { restock: false })
    expect(res).toMatchObject({ ok: true, changed: true })
    expect(refund).toHaveBeenCalledTimes(1)
    const after = await reload(order.id)
    expect(after).toMatchObject({ status: 'returned', paymentStatus: 'refunded', creditNote: { needed: true } })
    expect(after.razorpay?.refundId).toMatch(/^rfnd_mock_/)
    expect(after.restocked).toBeFalsy()
  })

  it('restocks an RTO order only once', async () => {
    const order = await place('cod')
    await setStatus(order.id, 'rto')
    const before = await stockOf(sand)
    expect(await restockOrder(payload, order.id)).toMatchObject({ ok: true, changed: true })
    expect(await restockOrder(payload, order.id)).toMatchObject({ ok: true, changed: false })
    expect(await stockOf(sand)).toBe(before + 1)
    expect((await reload(order.id)).restocked).toBe(true)
  })

  it('marks alerts and credit notes handled', async () => {
    const order = await place('cod')
    await payload.update({
      collection: 'orders',
      id: order.id,
      depth: 0,
      data: { alert: { message: 'Check this', handled: false }, creditNote: { needed: true, handled: false } } as never,
    })
    expect(await handleAlert(payload, order.id, 'alert')).toMatchObject({ ok: true })
    expect(await handleAlert(payload, order.id, 'creditNote')).toMatchObject({ ok: true })
    expect(await reload(order.id)).toMatchObject({ alert: { handled: true }, creditNote: { handled: true } })
  })

  it('sends received and admin emails at COD checkout, and paid emails on payment', async () => {
    await setBusinessEmail('owner@example.com')
    const cod = await place('cod', 'cod@example.com')
    const codTags = (await emails(cod.orderNumber)).docs.map((e) => e.tag).sort()
    expect(codTags).toEqual(['admin_new_order', 'order_received'])
    const paid = await placePaid('paid@example.com')
    const paidTags = (await emails(paid.orderNumber)).docs.map((e) => e.tag).sort()
    expect(paidTags).toEqual(['admin_new_order', 'order_paid'])
  })

  const placeBooked = async () => {
    const order = await placePaid()
    await payload.update({
      collection: 'orders',
      id: order.id,
      depth: 0,
      data: { shipment: { shiprocketOrderId: `sr_${seq}` } } as never,
    })
    return order
  }

  it('cancels a booked prepaid order: one courier cancel, one refund', async () => {
    const order = await placeBooked()
    const cancel = vi.spyOn(mockShiprocket, 'cancelShipment')
    const refund = vi.spyOn(mockRazorpay, 'refund')
    const res = await cancelOrder(payload, order.id, { by: 'admin', note: 'Cancelled by admin' })
    expect(res).toMatchObject({ ok: true, changed: true })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(refund).toHaveBeenCalledTimes(1)
    expect((await reload(order.id)).status).toBe('cancelled')
  })

  it('leaves the order untouched when the courier cancel fails', async () => {
    const order = await placeBooked()
    const before = await stockOf(sand)
    vi.spyOn(mockShiprocket, 'cancelShipment').mockRejectedValueOnce(new Error('down'))
    const refund = vi.spyOn(mockRazorpay, 'refund')
    const res = await cancelOrder(payload, order.id, { by: 'admin', note: 'x' })
    expect(res).toEqual({ ok: false, status: 502, error: "We couldn't cancel the courier booking. Please try again." })
    expect(refund).not.toHaveBeenCalled()
    expect((await reload(order.id)).status).toBe('confirmed')
    expect(await stockOf(sand)).toBe(before)
  })

  it('leaves the order untouched when the refund fails', async () => {
    const order = await placePaid()
    const before = await stockOf(sand)
    vi.spyOn(mockRazorpay, 'refund').mockRejectedValueOnce(new Error('down'))
    const res = await cancelOrder(payload, order.id, { by: 'admin', note: 'x' })
    expect(res).toEqual({ ok: false, status: 502, error: "We couldn't process the refund. Please try again." })
    expect(await reload(order.id)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' })
    expect(await stockOf(sand)).toBe(before)
  })

  it('refuses a cancel from a status outside allowFrom', async () => {
    const order = await place('cod')
    const res = await cancelOrder(payload, order.id, { by: 'system', note: 'x', allowFrom: ['pending_payment'] })
    expect(res).toEqual({ ok: false, status: 409, error: "This order can't be cancelled from Awaiting confirmation." })
    expect((await reload(order.id)).status).toBe('awaiting_confirmation')
  })

  it('treats cancelling an already refunded late-payment order as done, with no second refund', async () => {
    const order = await place('prepaid')
    await cancelPendingOrder(payload, order.id, 'expired')
    await setStock(sand, 0)
    const late = await markPaid(payload, { razorpayOrderId: order.razorpay!.orderId as string, paymentId: 'pay_late_act' })
    expect(late.outcome).toBe('late_refunded')
    const refund = vi.spyOn(mockRazorpay, 'refund')
    const res = await cancelOrder(payload, order.id, { by: 'admin', note: 'x' })
    expect(res).toMatchObject({ ok: true, changed: false })
    expect(refund).not.toHaveBeenCalled()
  })

  it('does not email the customer when the payment could not be started', async () => {
    vi.spyOn(mockRazorpay, 'createOrder').mockRejectedValueOnce(new Error('down'))
    const order = await place('prepaid', 'quiet@example.com', 502)
    expect((await reload(order.id)).status).toBe('cancelled')
    const tags = (await emails(order.orderNumber)).docs.map((e) => e.tag)
    expect(tags).not.toContain('cancelled')
  })
})
