import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { formatINR } from '@/lib/format'
import { getRazorpay } from '@/lib/integrations/razorpay'
import { getTurnstile } from '@/lib/integrations/turnstile'
import { afterResponse } from '@/lib/afterResponse'
import { notify } from '@/lib/notifications/notify'
import type { Order } from '@/payload-types'
import { revalidate } from '@/lib/revalidate'

import type { CheckoutInput } from './checkoutInput'
import { formatOrderNumber, nextNumber } from './counters'
import { withTransaction } from './db'
import { cancelPendingOrder, productTags } from './orderOps'
import type { OrderStatus } from './orderStateMachine'
import { buildPaymentLaunch, orderUrl, type PaymentLaunch } from './paymentLaunch'
import { computeCheckout } from './quote'
import { hitRateLimit } from './rateLimit'
import { reserveStock, type StockItem } from './stock'

type OrderBody = { orderNumber: string; token: string; orderUrl: string; payment: PaymentLaunch | null }
export type PlaceOrderResponse =
  | { status: 200 | 201; body: OrderBody }
  | {
      status: 400 | 409 | 422 | 429 | 502
      body: { error: string; code?: 'cart_changed' | 'price_changed' | 'stock' | 'turnstile'; field?: string }
    }

const PHONE_DAILY_LIMIT = 3

const orderBody = (order: Order): OrderBody => ({
  orderNumber: order.orderNumber,
  token: order.accessToken,
  orderUrl: orderUrl(order.orderNumber, order.accessToken),
  payment: buildPaymentLaunch(order),
})

/** Thrown inside the transaction to roll it back when the phone already has its daily orders. */
class PhoneLimitReached extends Error {
  constructor() {
    super('Phone daily order limit reached')
  }
}

const PHONE_LIMIT_MESSAGE = "You've placed 3 orders today. Please WhatsApp us to order more."

/** Thrown inside the transaction to roll it back when stock ran short. */
class StockShortfall extends Error {
  constructor(
    readonly productId: number,
    readonly variantId: string,
    readonly available: number,
  ) {
    super('Not enough stock')
  }
}

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    const x = e as { code?: unknown; name?: unknown; cause?: unknown }
    if (x.code === '23505' || x.name === 'ValidationError') return true
    e = x.cause
  }
  return false
}

async function findByKey(payload: Payload, key: string): Promise<Order | null> {
  const { docs } = await payload.find({
    collection: 'orders',
    where: { 'meta.idempotencyKey': { equals: key } },
    limit: 1,
    depth: 0,
  })
  return docs[0] ?? null
}

export async function placeOrder(
  payload: Payload,
  input: CheckoutInput,
  ctx: { ipHash: string; userAgent: string },
): Promise<PlaceOrderResponse> {
  const fail = <S extends 400 | 409 | 422 | 429 | 502>(
    status: S,
    error: string,
    extra: { code?: 'cart_changed' | 'price_changed' | 'stock' | 'turnstile'; field?: string } = {},
  ) => ({ status, body: { error, ...extra } })

  // 1. Honeypot
  if (input.honeypot) return fail(400, 'Something went wrong. Please try again.')

  // 2. Repeated idempotency key: hand back the order that key already made
  const existing = await findByKey(payload, input.idempotencyKey)
  if (existing) return { status: 200, body: orderBody(existing) }

  // 3. Per-IP rate limit (failed attempts count)
  const allowed = await hitRateLimit(payload, `checkout:${ctx.ipHash}`, { limit: 10, windowMs: 3_600_000 })
  if (!allowed) return fail(429, 'Too many attempts. Please try again in an hour.')

  // 4. Turnstile
  if (!(await getTurnstile().verify(input.turnstileToken))) {
    return fail(400, 'Please complete the security check and try again.', { code: 'turnstile' })
  }

  // 5. Orders per phone per day
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
  const { totalDocs: recent } = await payload.count({
    collection: 'orders',
    where: {
      and: [{ 'customer.phone': { equals: input.customer.phone } }, { createdAt: { greater_than: since } }],
    },
  })
  if (recent >= PHONE_DAILY_LIMIT) {
    return fail(429, PHONE_LIMIT_MESSAGE)
  }

  // 6. Re-run the server-side computation; the client's numbers are never trusted
  const { quote, lines } = await computeCheckout(
    payload,
    {
      items: input.items,
      pincode: input.address.pincode,
      paymentMethod: input.paymentMethod,
      discountCode: input.discountCode,
      phone: input.customer.phone,
    },
    'order',
  )
  if (quote.issues.some((i) => i.message === 'This item is no longer available')) {
    return fail(409, "Some items in your cart are no longer available. We've updated your cart.", {
      code: 'cart_changed',
    })
  }
  if (!quote.delivery?.serviceable) {
    return fail(
      422,
      quote.delivery?.message ?? `Sorry, we can't deliver to ${input.address.pincode} yet`,
      { field: 'pincode' },
    )
  }
  if (quote.codeError) return fail(422, quote.codeError, { field: 'discountCode' })
  const { totals } = quote
  if (totals.total !== input.expectedTotal) {
    return fail(409, `Your total changed to ${formatINR(totals.total)}. Please check and place your order again.`, {
      code: 'price_changed',
    })
  }
  if (input.paymentMethod === 'cod' && !quote.cod.eligible) {
    return fail(422, quote.cod.reason, { field: 'paymentMethod' })
  }

  // 7. Reserve stock and create the order in one transaction
  const cod = input.paymentMethod === 'cod'
  const status: OrderStatus = cod ? 'awaiting_confirmation' : 'pending_payment'
  const stockItems: StockItem[] = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty }))
  let order: Order
  try {
    order = await withTransaction(payload, async (tx) => {
      // Authoritative phone limit: the check in step 5 is only a fast path, parallel orders pass it together
      await tx.db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'phone:' + input.customer.phone}))`)
      const { totalDocs: placed } = await payload.count({
        collection: 'orders',
        req: tx.req,
        where: {
          and: [{ 'customer.phone': { equals: input.customer.phone } }, { createdAt: { greater_than: since } }],
        },
      })
      if (placed >= PHONE_DAILY_LIMIT) throw new PhoneLimitReached()
      const reserved = await reserveStock(tx.db, stockItems)
      if (!reserved.ok) throw new StockShortfall(reserved.productId, reserved.variantId, reserved.available)
      const orderNumber = formatOrderNumber(await nextNumber(tx.db, 'order', 1000))
      return payload.create({
        collection: 'orders',
        depth: 0,
        req: tx.req,
        data: {
          orderNumber,
          accessToken: randomBytes(24).toString('base64url'),
          status,
          paymentMethod: input.paymentMethod,
          paymentStatus: cod ? 'cod_pending' : 'unpaid',
          customer: input.customer,
          address: input.address,
          items: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            title: l.title,
            variantName: l.variantName,
            slug: l.slug,
            unitPrice: l.unitPrice,
            qty: l.qty,
            hsnCode: l.hsnCode,
            gstRate: l.gstRate,
            weightGrams: l.weightGrams,
            lengthCm: l.lengthCm,
            widthCm: l.widthCm,
            heightCm: l.heightCm,
          })),
          subtotal: totals.subtotal,
          discountCode: quote.discountCode,
          codeDiscount: totals.codeDiscount,
          shippingFee: totals.shippingFee,
          prepaidDiscount: totals.prepaidDiscount,
          total: totals.total,
          timeline: [{ status, at: new Date().toISOString(), by: 'system', note: 'Order placed' }],
          meta: {
            ipHash: ctx.ipHash,
            userAgent: ctx.userAgent.slice(0, 200),
            turnstileVerified: true,
            idempotencyKey: input.idempotencyKey,
          },
        },
      })
    })
  } catch (err) {
    if (err instanceof PhoneLimitReached) return fail(429, PHONE_LIMIT_MESSAGE)
    if (err instanceof StockShortfall) {
      const line = lines.find((l) => l.productId === err.productId && l.variantId === err.variantId)
      const title = line?.title ?? 'this item'
      const variant = line && line.variantName !== 'Default' ? ` (${line.variantName})` : ''
      return fail(409, `Only ${err.available} left of ${title}${variant}`, { code: 'stock' })
    }
    if (isUniqueViolation(err)) {
      // A concurrent request with the same key won; the transaction has rolled back
      const winner = await findByKey(payload, input.idempotencyKey)
      if (winner) return { status: 200, body: orderBody(winner) }
    }
    throw err
  }

  // 8. Stock changed, so refresh the storefront
  revalidate(productTags(lines.map((l) => l.slug)))

  // Cash on delivery: the order is placed, so tell the customer and the owner
  if (cod) {
    await afterResponse(() =>
      Promise.all([notify(payload, 'order_received', order), notify(payload, 'admin_new_order', order)]),
    )
  }

  // 9. Prepaid: open the Razorpay order
  if (!cod) {
    try {
      const rzp = await getRazorpay().createOrder({
        amountPaise: totals.total * 100,
        receipt: order.orderNumber,
        notes: { orderNumber: order.orderNumber },
      })
      order = await payload.update({
        collection: 'orders',
        id: order.id,
        depth: 0,
        data: { razorpay: { orderId: rzp.id } },
      })
    } catch (err) {
      payload.logger.error({ err, orderNumber: order.orderNumber }, 'Could not start the payment')
      try {
        await cancelPendingOrder(payload, order.id, 'Payment could not be started', { notify: false })
      } catch (cancelErr) {
        payload.logger.error(
          { err: cancelErr, orderNumber: order.orderNumber },
          'Could not cancel the order after a payment start failure',
        )
      }
      return fail(502, "We couldn't start the payment. Please try again.")
    }
  }

  // 10.
  return { status: 201, body: orderBody(order) }
}
