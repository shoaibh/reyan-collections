import type { Payload } from 'payload'

import type { Order } from '@/payload-types'
import { getRazorpay } from '@/lib/integrations/razorpay'
import { notify } from '@/lib/notifications/notify'
import { revalidate } from '@/lib/revalidate'

import { withTransaction } from './db'
import { lockOrder, productTags, withTimelineEntry } from './orderOps'
import { assertTransition } from './orderStateMachine'
import { orderUrl } from './paymentLaunch'
import { reserveStock, type StockItem } from './stock'

export type PaidOutcome = 'confirmed' | 'already_paid' | 'late_confirmed' | 'late_refunded' | 'unknown_order'

async function findOrderId(payload: Payload, razorpayOrderId: string): Promise<number | null> {
  const found = await payload.find({
    collection: 'orders',
    where: { 'razorpay.orderId': { equals: razorpayOrderId } },
    limit: 1,
    depth: 0,
  })
  return found.docs[0]?.id ?? null
}

const stockItems = (order: Order): StockItem[] =>
  (order.items ?? []).map((i) => ({
    productId: i.productId as number,
    variantId: i.variantId as string,
    qty: i.qty as number,
  }))

/**
 * Marks an order paid. Shared by the verify route, the webhook and the mock pay page, so it is
 * idempotent: the order row lock serialises concurrent calls and a repeat is a no-op. A payment
 * that lands after the order was cancelled re-reserves stock, or is refunded when stock is gone.
 * A refund that throws rolls everything back and rethrows, so the webhook can be retried.
 */
export async function markPaid(
  payload: Payload,
  input: { razorpayOrderId: string; paymentId: string },
): Promise<{ outcome: PaidOutcome; order: Order | null }> {
  const orderId = await findOrderId(payload, input.razorpayOrderId)
  if (orderId === null) return { outcome: 'unknown_order', order: null }

  const result = await withTransaction(payload, async (tx) => {
    await lockOrder(tx.db, orderId)
    const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, req: tx.req })
    const razorpay = { ...order.razorpay, paymentId: input.paymentId }
    const update = (data: Partial<Order>) =>
      payload.update({ collection: 'orders', id: orderId, depth: 0, req: tx.req, data })

    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
      if (order.razorpay?.paymentId && order.razorpay.paymentId !== input.paymentId) {
        payload.logger.warn(
          `Order ${order.orderNumber} is already ${order.paymentStatus} with payment ${order.razorpay.paymentId}; received another payment ${input.paymentId}. Check for a double charge.`,
        )
      }
      return { outcome: 'already_paid' as const, order, stockChanged: false }
    }

    if (order.status === 'pending_payment') {
      assertTransition('pending_payment', 'confirmed')
      const updated = await update({
        status: 'confirmed',
        paymentStatus: 'paid',
        razorpay,
        timeline: withTimelineEntry(order, { status: 'confirmed', by: 'system', note: 'Payment received' }),
      })
      return { outcome: 'confirmed' as const, order: updated, stockChanged: false }
    }

    if (order.status === 'cancelled' && order.paymentStatus === 'unpaid') {
      const reserved = await reserveStock(tx.db, stockItems(order))
      if (reserved.ok) {
        assertTransition('cancelled', 'confirmed', { latePayment: true })
        const updated = await update({
          status: 'confirmed',
          paymentStatus: 'paid',
          razorpay,
          timeline: withTimelineEntry(order, {
            status: 'confirmed',
            by: 'system',
            note: 'Paid after expiry; stock re-reserved',
          }),
        })
        return { outcome: 'late_confirmed' as const, order: updated, stockChanged: true }
      }
      // Refund inside the lock on purpose: concurrent verify and webhook calls can't double-refund. If the commit
      // fails after Razorpay refunds, a retry could refund again (accepted at this volume).
      const refund = await getRazorpay().refund(input.paymentId, (order.total ?? 0) * 100)
      const updated = await update({
        paymentStatus: 'refunded',
        razorpay: { ...razorpay, refundId: refund.id },
        alert: { message: 'Paid after expiry, refunded', handled: false },
        timeline: withTimelineEntry(order, {
          status: 'cancelled',
          by: 'system',
          note: 'Paid after expiry; refunded (out of stock)',
        }),
      })
      return { outcome: 'late_refunded' as const, order: updated, stockChanged: false }
    }

    // Any other state (for example a COD order) has nothing to confirm.
    return { outcome: 'already_paid' as const, order, stockChanged: false }
  })

  if (result.stockChanged) revalidate(productTags((result.order.items ?? []).map((i) => i.slug ?? '')))
  if (result.outcome === 'confirmed' || result.outcome === 'late_confirmed') {
    await notify(payload, 'order_paid', result.order)
    await notify(payload, 'admin_new_order', result.order)
  } else if (result.outcome === 'late_refunded') {
    await notify(payload, 'refunded', result.order, { refundAmount: result.order.total ?? 0 })
  }
  return { outcome: result.outcome, order: result.order }
}

/** Notes a failed attempt on an unpaid order, once per payment. The order stays pending so the customer can retry. */
export async function recordPaymentFailure(
  payload: Payload,
  input: { razorpayOrderId: string; paymentId: string | null; reason: string },
): Promise<void> {
  const orderId = await findOrderId(payload, input.razorpayOrderId)
  if (orderId === null) return
  const note = `Payment failed${input.paymentId ? ` (${input.paymentId})` : ''}`
  await withTransaction(payload, async (tx) => {
    await lockOrder(tx.db, orderId)
    const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, req: tx.req })
    if (order.status !== 'pending_payment') return
    payload.logger.info(`Payment failed for order ${order.orderNumber}: ${input.reason}`)
    if ((order.timeline ?? []).some((t) => t.note === note)) return
    await payload.update({
      collection: 'orders',
      id: orderId,
      depth: 0,
      req: tx.req,
      data: { timeline: withTimelineEntry(order, { status: 'pending_payment', by: 'system', note }) },
    })
  })
}

/** Checks a Razorpay Checkout result and confirms the order. The verify route and the mock page share it. */
export async function verifyPayment(
  payload: Payload,
  input: { orderId: string; paymentId: string; signature: string },
): Promise<{ status: 200 | 400 | 404; body: { url: string } | { error: string } }> {
  if (!getRazorpay().verifyPaymentSignature(input)) {
    return { status: 400, body: { error: 'Payment could not be verified' } }
  }
  const { outcome, order } = await markPaid(payload, { razorpayOrderId: input.orderId, paymentId: input.paymentId })
  if (outcome === 'unknown_order' || !order) return { status: 404, body: { error: 'Order not found' } }
  return { status: 200, body: { url: orderUrl(order.orderNumber, order.accessToken) } }
}

type RazorpayEvent = {
  event?: unknown
  payload?: {
    payment?: { entity?: { id?: unknown; order_id?: unknown; error_description?: unknown } }
    order?: { entity?: { id?: unknown } }
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export async function handleRazorpayWebhook(
  payload: Payload,
  rawBody: string,
  signature: string | null,
): Promise<{ status: 200 | 400 | 500 }> {
  if (!signature || !getRazorpay().verifyWebhookSignature(rawBody, signature)) return { status: 400 }
  let event: RazorpayEvent
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (typeof parsed !== 'object' || parsed === null) return { status: 400 }
    event = parsed as RazorpayEvent
  } catch {
    return { status: 400 }
  }

  const payment = event.payload?.payment?.entity
  try {
    if (event.event === 'order.paid') {
      const razorpayOrderId = str(event.payload?.order?.entity?.id) ?? str(payment?.order_id)
      const paymentId = str(payment?.id)
      if (razorpayOrderId && paymentId) await markPaid(payload, { razorpayOrderId, paymentId })
    } else if (event.event === 'payment.failed') {
      const razorpayOrderId = str(payment?.order_id)
      if (razorpayOrderId) {
        await recordPaymentFailure(payload, {
          razorpayOrderId,
          paymentId: str(payment?.id),
          reason: str(payment?.error_description) ?? 'Payment failed',
        })
      }
    }
  } catch (err) {
    payload.logger.error({ err, event: event.event }, 'Razorpay webhook handling failed')
    return { status: 500 }
  }
  return { status: 200 }
}
