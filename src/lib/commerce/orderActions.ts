import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { getRazorpay } from '@/lib/integrations/razorpay'
import { getShiprocket, mapCourierStatus, type ShipmentInput } from '@/lib/integrations/shiprocket'
import { notify } from '@/lib/notifications/notify'
import type { NotifyEvent } from '@/lib/notifications/templates'
import type { Order } from '@/payload-types'
import { revalidate } from '@/lib/revalidate'

import { withTransaction, type Tx } from './db'
import { nextNumber } from './counters'
import { financialYear, formatInvoiceNumber } from './invoice'
import { lockOrder, productTags, stockItemsOf, withTimelineEntry } from './orderShared'
import { assertTransition, canTransition, nextStatuses, statusLabel, type OrderStatus } from './orderStateMachine'
import { releaseStock } from './stock'

export type ActionResult =
  | { ok: true; order: Order; changed: boolean }
  | { ok: false; status: 400 | 404 | 409 | 502; error: string }

type By = 'system' | 'admin'
type Failure = Extract<ActionResult, { ok: false }>

/** Thrown inside the transaction to roll it back and hand the caller a clean failure. */
class ActionFailure extends Error {
  constructor(
    readonly status: Failure['status'],
    message: string,
  ) {
    super(message)
  }
}

type Outcome = {
  order: Order
  changed: boolean
  stockChanged?: boolean
  /** Notifications to send once the transaction has committed. */
  notifications?: { event: NotifyEvent; extra?: { refundAmount?: number } }[]
}

const AFTER_CONFIRMED: OrderStatus[] = [
  'confirmed',
  'ready_to_ship',
  'shipped',
  'out_for_delivery',
  'delivered',
  'rto',
  'returned',
]

const blocked = (verb: string, status: OrderStatus) =>
  new ActionFailure(409, `This order can't be ${verb} from ${statusLabel(status)}.`)

const update = (tx: Tx, payload: Payload, orderId: number, data: Partial<Order>) =>
  payload.update({ collection: 'orders', id: orderId, depth: 0, req: tx.req, data })

/**
 * The shared shape of every action: lock the order row, re-read it inside the lock, let `body`
 * decide (a repeat becomes a no-op) and mutate, commit, then refresh the storefront and notify.
 */
async function runAction(
  payload: Payload,
  orderId: number,
  body: (tx: Tx, order: Order) => Promise<Outcome>,
): Promise<ActionResult> {
  let outcome: Outcome
  try {
    outcome = await withTransaction(payload, async (tx) => {
      await lockOrder(tx.db, orderId)
      let order: Order
      try {
        order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, req: tx.req })
      } catch {
        throw new ActionFailure(404, 'Order not found')
      }
      return body(tx, order)
    })
  } catch (err) {
    if (err instanceof ActionFailure) return { ok: false, status: err.status, error: err.message }
    throw err
  }
  if (outcome.stockChanged) revalidate(productTags((outcome.order.items ?? []).map((i) => i.slug ?? '')))
  for (const n of outcome.notifications ?? []) await notify(payload, n.event, outcome.order, n.extra)
  return { ok: true, order: outcome.order, changed: outcome.changed }
}

/** Refunds a paid prepaid order in full while the order lock is held. */
async function refundInLock(payload: Payload, order: Order): Promise<{ refundId: string; amount: number }> {
  const paymentId = order.razorpay?.paymentId
  if (!paymentId) throw new ActionFailure(502, "We couldn't process the refund. Please try again.")
  const amount = order.total ?? 0
  try {
    const refund = await getRazorpay().refund(paymentId, amount * 100)
    // Logged at once: if the commit fails after this, the refund can still be reconciled from the logs.
    payload.logger.info(
      { orderNumber: order.orderNumber, refundId: refund.id, amountPaise: amount * 100 },
      'Refund issued',
    )
    return { refundId: refund.id, amount }
  } catch {
    throw new ActionFailure(502, "We couldn't process the refund. Please try again.")
  }
}

const isPaidPrepaid = (order: Order) => order.paymentMethod === 'prepaid' && order.paymentStatus === 'paid'

/** Awaiting confirmation → confirmed, once the customer has said yes on WhatsApp. */
export function confirmOrder(payload: Payload, orderId: number): Promise<ActionResult> {
  return runAction(payload, orderId, async (tx, order) => {
    const status = order.status as OrderStatus
    if (AFTER_CONFIRMED.includes(status)) return { order, changed: false }
    if (status !== 'awaiting_confirmation') throw blocked('confirmed', status)
    assertTransition(status, 'confirmed')
    const updated = await update(tx, payload, orderId, {
      status: 'confirmed',
      timeline: withTimelineEntry(order, { status: 'confirmed', by: 'admin', note: 'Confirmed on WhatsApp' }),
    })
    return { order: updated, changed: true, notifications: [{ event: 'cod_confirmed' }] }
  })
}

/**
 * Cancels an order that has not shipped: cancels the courier booking, puts stock back and refunds a
 * paid prepaid order. The network calls run under the row lock, so a double tap books one refund.
 */
export function cancelOrder(
  payload: Payload,
  orderId: number,
  opts: { by: By; note: string; allowFrom?: OrderStatus[]; notify?: boolean },
): Promise<ActionResult> {
  const allowFrom = opts.allowFrom ?? ['pending_payment', 'awaiting_confirmation', 'confirmed', 'ready_to_ship']
  return runAction(payload, orderId, async (tx, order) => {
    const status = order.status as OrderStatus
    if (status === 'cancelled') return { order, changed: false }
    if (!allowFrom.includes(status) || !canTransition(status, 'cancelled')) throw blocked('cancelled', status)

    const shiprocketOrderId = order.shipment?.shiprocketOrderId
    if (shiprocketOrderId) {
      try {
        await getShiprocket().cancelShipment(shiprocketOrderId)
      } catch (err) {
        payload.logger.error({ err, orderNumber: order.orderNumber }, 'Could not cancel the courier booking')
        throw new ActionFailure(502, "We couldn't cancel the courier booking. Please try again.")
      }
    }

    await releaseStock(tx.db, stockItemsOf(order))

    const data: Partial<Order> = {
      status: 'cancelled',
      timeline: withTimelineEntry(order, { status: 'cancelled', by: opts.by, note: opts.note }),
    }
    let refundAmount: number | undefined
    if (isPaidPrepaid(order)) {
      const refund = await refundInLock(payload, order)
      refundAmount = refund.amount
      data.paymentStatus = 'refunded'
      data.razorpay = { ...order.razorpay, refundId: refund.refundId }
    }
    const updated = await update(tx, payload, orderId, data)
    return {
      order: updated,
      changed: true,
      stockChanged: true,
      notifications:
        opts.notify === false
          ? []
          : [{ event: 'cancelled', extra: refundAmount === undefined ? undefined : { refundAmount } }],
    }
  })
}

/** Shipped or out for delivery → delivered. A COD order is also marked as paid in cash. */
export function markDelivered(
  payload: Payload,
  orderId: number,
  opts: { by: By; note?: string },
): Promise<ActionResult> {
  return runAction(payload, orderId, async (tx, order) => {
    const status = order.status as OrderStatus
    if (status === 'delivered') return { order, changed: false }
    if (!canTransition(status, 'delivered')) throw blocked('marked delivered', status)
    const data: Partial<Order> = {
      status: 'delivered',
      timeline: withTimelineEntry(order, { status: 'delivered', by: opts.by, note: opts.note ?? 'Delivered' }),
    }
    if (order.paymentMethod === 'cod') data.paymentStatus = 'cod_collected'
    return { order: await update(tx, payload, orderId, data), changed: true }
  })
}

/** Delivered → returned, optionally restocking, with a refund for prepaid and a note for COD cash. */
export function markReturned(
  payload: Payload,
  orderId: number,
  opts: { restock: boolean; refundNote?: string; by?: By },
): Promise<ActionResult> {
  return runAction(payload, orderId, async (tx, order) => {
    const status = order.status as OrderStatus
    if (status === 'returned') return { order, changed: false }
    if (!canTransition(status, 'returned')) throw blocked('marked returned', status)
    const refundNote = opts.refundNote?.trim()
    const cod = order.paymentMethod === 'cod'
    if (cod && !refundNote) throw new ActionFailure(400, 'Add a note about the cash refund')

    const data: Partial<Order> = { status: 'returned' }
    const notifications: Outcome['notifications'] = []
    let restocked = false
    if (opts.restock && !order.restocked) {
      await releaseStock(tx.db, stockItemsOf(order))
      data.restocked = true
      restocked = true
    }
    data.timeline = withTimelineEntry(order, {
      status: 'returned',
      by: opts.by ?? 'admin',
      note: restocked ? 'Returned; stock restored' : 'Returned',
    })
    if (cod) data.refundNote = refundNote
    if (isPaidPrepaid(order)) {
      const refund = await refundInLock(payload, order)
      data.paymentStatus = 'refunded'
      data.razorpay = { ...order.razorpay, refundId: refund.refundId }
      notifications.push({ event: 'refunded', extra: { refundAmount: refund.amount } })
    }
    if (order.invoice?.number) data.creditNote = { ...order.creditNote, needed: true }
    return {
      order: await update(tx, payload, orderId, data),
      changed: true,
      stockChanged: data.restocked === true,
      notifications,
    }
  })
}

/** Puts the stock of a returned-to-us or returned order back on the shelf, once. */
export function restockOrder(payload: Payload, orderId: number): Promise<ActionResult> {
  return runAction(payload, orderId, async (tx, order) => {
    const status = order.status as OrderStatus
    if (status !== 'rto' && status !== 'returned') throw blocked('restocked', status)
    if (order.restocked) return { order, changed: false }
    await releaseStock(tx.db, stockItemsOf(order))
    const updated = await update(tx, payload, orderId, {
      restocked: true,
      timeline: withTimelineEntry(order, { status, by: 'admin', note: 'Stock restored' }),
    })
    return { order: updated, changed: true, stockChanged: true }
  })
}

/** Marks an order's alert, or its credit note task, as handled. */
export function handleAlert(
  payload: Payload,
  orderId: number,
  kind: 'alert' | 'creditNote',
): Promise<ActionResult> {
  return runAction(payload, orderId, async (tx, order) => {
    if (kind === 'alert' ? order.alert?.handled : order.creditNote?.handled) return { order, changed: false }
    const data: Partial<Order> =
      kind === 'alert'
        ? { alert: { ...order.alert, handled: true } }
        : { creditNote: { ...order.creditNote, handled: true } }
    return { order: await update(tx, payload, orderId, data), changed: true }
  })
}

/**
 * Cancels an order that has not been confirmed yet, putting its stock back. Returns the cancelled
 * order, or null when it is no longer pending (already paid, confirmed, or cancelled). Pass
 * `notify: false` when the customer is already looking at the failure (for example a payment that
 * could not start).
 */
export async function cancelPendingOrder(
  payload: Payload,
  orderId: number,
  note: string,
  opts?: { notify?: boolean },
): Promise<Order | null> {
  const result = await cancelOrder(payload, orderId, {
    by: 'system',
    note,
    allowFrom: ['pending_payment', 'awaiting_confirmation'],
    notify: opts?.notify,
  })
  return result.ok && result.changed ? result.order : null
}

const COURIER_STATES: OrderStatus[] = ['shipped', 'out_for_delivery', 'delivered', 'rto']

/** Books the courier, allocates the GST invoice number and moves a confirmed order to ready to ship. */
export function shipOrder(payload: Payload, orderId: number): Promise<ActionResult> {
  return runAction(payload, orderId, async (tx, order) => {
    const status = order.status as OrderStatus
    if (['ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'rto', 'returned'].includes(status)) {
      return { order, changed: false }
    }
    if (status !== 'confirmed') throw blocked('shipped', status)
    assertTransition(status, 'ready_to_ship')

    const settings = await payload.findGlobal({ slug: 'store-settings', depth: 0, req: tx.req })
    const items = order.items ?? []
    const weightKg = Number(
      (items.reduce((sum, i) => sum + (i.weightGrams ?? 0) * (i.qty ?? 0), 0) / 1000).toFixed(3),
    )
    const volume = (i: (typeof items)[number]) => (i.lengthCm ?? 0) * (i.widthCm ?? 0) * (i.heightCm ?? 0)
    const biggest = items.reduce<(typeof items)[number] | undefined>(
      (best, i) => (best === undefined || volume(i) > volume(best) ? i : best),
      undefined,
    )
    const input: ShipmentInput = {
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      pickupLocation: settings.business?.shiprocketPickupName || 'Primary',
      customer: { name: order.customer?.name ?? '', phone: order.customer?.phone ?? '', email: order.customer?.email ?? null },
      address: order.address,
      items: items.map((i) => ({
        name: i.title ?? '',
        sku: i.variantId ?? '',
        units: i.qty ?? 0,
        sellingPrice: i.unitPrice ?? 0,
        hsn: i.hsnCode ?? '',
      })),
      paymentMethod: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
      subTotal: order.total ?? 0,
      weightKg,
      lengthCm: biggest?.lengthCm ?? 0,
      breadthCm: biggest?.widthCm ?? 0,
      heightCm: biggest?.heightCm ?? 0,
    }

    // If the invoice or update step below fails after a successful booking, the transaction rolls back
    // and the courier booking is orphaned. Accepted: the operator cancels it in Shiprocket.
    let booking: Awaited<ReturnType<ReturnType<typeof getShiprocket>['bookShipment']>>
    try {
      booking = await getShiprocket().bookShipment(input)
    } catch (err) {
      payload.logger.error({ err, orderNumber: order.orderNumber }, 'Could not book the courier')
      throw new ActionFailure(502, "Shiprocket couldn't book this order. Please try again.")
    }
    payload.logger.info({ orderNumber: order.orderNumber, awb: booking.awb }, 'Courier booked')

    const now = new Date()
    const fy = financialYear(now)
    const prefix = settings.invoicing?.invoicePrefix || 'RC'
    const number = formatInvoiceNumber(prefix, fy, await nextNumber(tx.db, `invoice:${fy}`, 0))
    const at = now.toISOString()
    const timeline = [
      ...withTimelineEntry(order, {
        status: 'ready_to_ship',
        by: 'admin',
        note: `Booked with ${booking.courierName} · AWB ${booking.awb}`,
      }),
      ...booking.warnings.map((note) => ({ status: 'ready_to_ship', by: 'system' as const, at, note })),
    ]
    const updated = await update(tx, payload, orderId, {
      status: 'ready_to_ship',
      shipment: {
        ...order.shipment,
        shiprocketOrderId: booking.shiprocketOrderId,
        shipmentId: booking.shipmentId,
        awb: booking.awb,
        courierName: booking.courierName,
        labelUrl: booking.labelUrl,
        trackingUrl: booking.trackingUrl,
      },
      invoice: { number, issuedAt: at },
      timeline,
    })
    return { order: updated, changed: true, notifications: [{ event: 'shipped' }] }
  })
}

/** Shortest forward path from `from` to `to` through the courier states, excluding `from`; null if none. */
function courierPath(from: OrderStatus, to: OrderStatus): OrderStatus[] | null {
  const queue: { at: OrderStatus; path: OrderStatus[] }[] = [{ at: from, path: [] }]
  const seen = new Set<OrderStatus>([from])
  for (let head = 0; head < queue.length; head++) {
    const { at, path } = queue[head]!
    for (const next of nextStatuses(at)) {
      if (seen.has(next) || !COURIER_STATES.includes(next)) continue
      if (next === to) return [...path, next]
      seen.add(next)
      queue.push({ at: next, path: [...path, next] })
    }
  }
  return null
}

/**
 * Adds a phone to the COD blocklist unless it is already there. One statement, so a concurrent
 * insert cannot abort the order transaction (a caught unique violation would).
 */
async function blocklistPhone(tx: Tx, phone: string, reason: string): Promise<void> {
  await tx.db.execute(
    sql`INSERT INTO cod_blocklist (phone, reason) VALUES (${phone}, ${reason}) ON CONFLICT (phone) DO NOTHING`,
  )
}

const IST_NO_ZONE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/

/** Shiprocket sends IST wall-clock times without a zone; read those as +05:30. Null when unparseable. */
export function parseCourierTime(value: string): string | null {
  const m = IST_NO_ZONE.exec(value.trim())
  const d = new Date(m ? `${m[1]}T${m[2]}+05:30` : value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Applies a courier tracking event: records it once, then walks the order forward through the state
 * machine. An event that would move the order backwards is recorded but changes nothing else.
 */
export async function applyCourierEvent(
  payload: Payload,
  input: { awb: string; rawStatus: string; at: string; raw: unknown; source: 'webhook' | 'poll' | 'simulate' },
): Promise<{ applied: OrderStatus[]; order: Order | null }> {
  const found = await payload.find({
    collection: 'orders',
    where: { 'shipment.awb': { equals: input.awb } },
    limit: 1,
    depth: 0,
  })
  const orderId = found.docs[0]?.id
  if (orderId === undefined) return { applied: [], order: null }

  const applied: OrderStatus[] = []
  const result = await runAction(payload, orderId, async (tx, order) => {
    let when = parseCourierTime(input.at)
    if (!when) {
      payload.logger.warn({ at: input.at, awb: input.awb }, 'Unreadable courier timestamp, using now')
      when = new Date().toISOString()
    }
    const events = order.shipment?.events ?? []
    const duplicate = events.some(
      (e) => e.status === input.rawStatus && e.at && new Date(e.at).getTime() === new Date(when).getTime(),
    )
    const data: Partial<Order> = {}
    if (!duplicate) {
      data.shipment = {
        ...order.shipment,
        events: [...events, { status: input.rawStatus, at: when, raw: input.raw as never }],
      }
    }

    const target = mapCourierStatus(input.rawStatus)
    const current = order.status as OrderStatus
    const path = target && target !== current ? courierPath(current, target) : null
    if (path && !duplicate) {
      let timeline = order.timeline ?? []
      let from = current
      for (const step of path) {
        assertTransition(from, step)
        timeline = withTimelineEntry({ timeline }, { status: step, by: 'system', note: `Courier: ${input.rawStatus}` })
        from = step
      }
      data.status = target!
      data.timeline = timeline
      if (target === 'delivered' && order.paymentMethod === 'cod') data.paymentStatus = 'cod_collected'
      if (target === 'rto') {
        if (order.paymentMethod === 'cod' && order.customer?.phone) {
          await blocklistPhone(tx, order.customer.phone, `Refused at the door (${order.orderNumber})`)
          data.codBlocklisted = true
        }
        if (order.invoice?.number) data.creditNote = { ...order.creditNote, needed: true }
      }
      applied.push(...path)
    }
    if (Object.keys(data).length === 0) return { order, changed: false }
    return { order: await update(tx, payload, orderId, data), changed: true }
  })
  return { applied, order: result.ok ? result.order : null }
}
