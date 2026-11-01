import type { Payload } from 'payload'

import { getPickupPincode } from '@/lib/data/pickup'
import { integrationMode } from '@/lib/integrations/mode'
import { getShiprocket } from '@/lib/integrations/shiprocket'
import { siteUrl } from '@/lib/seo'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import type { Order } from '@/payload-types'

import { paymentLabelFor } from './customerOrder'
import { codConfirmMessage } from './messages'
import { canTransition, statusLabel, type OrderStatus } from './orderStateMachine'
import { orderUrl } from './paymentLaunch'
import type { PaymentMethod } from './pricing'
import { loadCommerceSettings } from './settings'

export type PanelAction = 'confirm' | 'ship' | 'cancel' | 'mark-delivered' | 'mark-returned' | 'restock'

export type OrderPanel = {
  id: number
  orderNumber: string
  status: OrderStatus
  statusLabel: string
  paymentMethod: PaymentMethod
  paymentLabel: string
  steps: { label: 'Placed' | 'Confirm' | 'Ship' | 'Delivered'; state: 'done' | 'now' | 'todo' }[]
  customer: { name: string; phone: string; email: string | null; address: string }
  eligibility: { ok: boolean; note: string }
  items: { label: string; qty: number; lineTotal: number }[]
  totals: { shippingFee: number; codeDiscount: number; prepaidDiscount: number; total: number; discountCode: string | null }
  whatsapp: { url: string; message: string } | null
  actions: PanelAction[]
  shipment: { awb: string; courierName: string; trackingUrl: string; labelUrl: string | null } | null
  invoice: { number: string; url: string } | null
  packingSlipUrl: string
  customerUrl: string
  alerts: { kind: 'alert' | 'creditNote'; message: string }[]
  codBlocklisted: boolean
  restocked: boolean
  autoCancelLabel: string | null
  dev: { simulate: boolean }
}

const STEP_LABELS = ['Placed', 'Confirm', 'Ship', 'Delivered'] as const
// How far along the Placed > Confirm > Ship > Delivered line an order is. Unlike the customer's line,
// a booked parcel (ready to ship) already counts as shipped here: the owner's next move is delivery.
const PANEL_STEP: Partial<Record<OrderStatus, 0 | 1 | 2 | 3>> = {
  pending_payment: 0,
  awaiting_confirmation: 0,
  confirmed: 1,
  ready_to_ship: 2,
  shipped: 2,
  out_for_delivery: 2,
  delivered: 3,
  returned: 3,
}

/** Cancelled and rto keep the furthest step their timeline reached. */
function stepOf(order: Order): 0 | 1 | 2 | 3 {
  const direct = PANEL_STEP[order.status as OrderStatus]
  if (direct !== undefined) return direct
  let step: 0 | 1 | 2 | 3 = 0
  for (const entry of order.timeline ?? []) {
    const s = PANEL_STEP[entry.status as OrderStatus]
    if (s !== undefined && s > step) step = s
  }
  return step
}

const AUTO_CANCEL_SHOWN_WITHIN_HOURS = 6

/** The courier simulator exists only outside production and only against the mock courier. */
export const canSimulateCourier = (): boolean =>
  process.env.NODE_ENV !== 'production' && integrationMode('SHIPROCKET') === 'mock'

async function eligibilityOf(payload: Payload, order: Order): Promise<OrderPanel['eligibility']> {
  const pincode = order.address?.pincode ?? ''
  const cod = order.paymentMethod === 'cod'
  try {
    const service = await getShiprocket().checkServiceability({
      pickupPincode: await getPickupPincode(payload),
      deliveryPincode: pincode,
      weightGrams: Math.max(
        1,
        (order.items ?? []).reduce((sum, i) => sum + (i.weightGrams ?? 0) * (i.qty ?? 0), 0),
      ),
      cod,
    })
    const problems: string[] = []
    if (!service.serviceable) {
      problems.push(`Couriers don't deliver to ${pincode}`)
    } else if (cod && !service.codAvailable) {
      problems.push('COD not available for this pincode')
    }
    if (cod) {
      const ids = [...new Set((order.items ?? []).map((i) => i.productId).filter((id): id is number => id != null))]
      const products = ids.length
        ? await payload.find({
            collection: 'products',
            where: { id: { in: ids } },
            limit: ids.length,
            depth: 0,
            pagination: false,
            select: { codAllowed: true },
          })
        : { docs: [] }
      if (products.docs.some((p) => p.codAllowed === false)) problems.push('COD not available for some items')
      const phone = order.customer?.phone
      const blocked = phone
        ? (await payload.count({ collection: 'cod-blocklist', where: { phone: { equals: phone } } })).totalDocs > 0
        : false
      if (blocked) problems.push('on COD blocklist')
    }
    if (problems.length) return { ok: false, note: `⚠ ${problems.join(' · ')}` }
    return { ok: true, note: cod ? '✓ Couriers deliver here · COD allowed · not on blocklist' : '✓ Couriers deliver here' }
  } catch (err) {
    payload.logger.error({ err, orderNumber: order.orderNumber }, 'Could not check delivery for the order panel')
    return { ok: false, note: "⚠ Couldn't check delivery right now" }
  }
}

function actionsOf(order: Order): PanelAction[] {
  const status = order.status as OrderStatus
  const actions: PanelAction[] = []
  if (status === 'awaiting_confirmation') actions.push('confirm')
  if (status === 'confirmed') actions.push('ship')
  if (status === 'shipped' || status === 'out_for_delivery') actions.push('mark-delivered')
  if (status === 'delivered') actions.push('mark-returned')
  if ((status === 'rto' || status === 'returned') && !order.restocked) actions.push('restock')
  if (canTransition(status, 'cancelled')) actions.push('cancel')
  return actions
}

function autoCancelLabelOf(
  order: Order,
  settings: { pendingPaymentMinutes: number; codConfirmHours: number },
  now: Date,
): string | null {
  const created = new Date(order.createdAt).getTime()
  if (order.status === 'pending_payment') {
    const left = created + settings.pendingPaymentMinutes * 60_000 - now.getTime()
    return `Auto-cancels in ${Math.max(0, Math.ceil(left / 60_000))} min`
  }
  if (order.status === 'awaiting_confirmation') {
    const left = created + settings.codConfirmHours * 3_600_000 - now.getTime()
    const hours = Math.max(0, Math.ceil(left / 3_600_000))
    return hours <= AUTO_CANCEL_SHOWN_WITHIN_HOURS ? `Auto-cancels in ${hours}h` : null
  }
  return null
}

export async function buildOrderPanel(payload: Payload, orderId: number, now: Date): Promise<OrderPanel | null> {
  const found = await payload.find({ collection: 'orders', where: { id: { equals: orderId } }, limit: 1, depth: 0 })
  const order = found.docs[0]
  if (!order) return null

  const status = order.status as OrderStatus
  const settings = await loadCommerceSettings(payload)
  const global = await payload.findGlobal({ slug: 'store-settings', depth: 0 })
  const storeName = global.business?.name || 'Reyan Collections'
  const step = stepOf(order)
  const addr = order.address
  const phone = order.customer?.phone ?? ''
  const alerts: OrderPanel['alerts'] = []
  if (order.alert?.message && !order.alert.handled) alerts.push({ kind: 'alert', message: order.alert.message })
  if (order.creditNote?.needed && !order.creditNote.handled) {
    alerts.push({ kind: 'creditNote', message: `Issue a credit note for invoice ${order.invoice?.number ?? ''}`.trim() })
  }

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status,
    statusLabel: statusLabel(status),
    paymentMethod: order.paymentMethod ?? 'prepaid',
    paymentLabel: paymentLabelFor(order),
    steps: STEP_LABELS.map((label, i) => ({
      label,
      state: i <= step ? 'done' : i === step + 1 ? 'now' : 'todo',
    })),
    customer: {
      name: order.customer?.name ?? '',
      phone,
      email: order.customer?.email || null,
      address: [
        addr?.line1,
        addr?.line2,
        addr?.landmark,
        addr?.city,
        [addr?.state, addr?.pincode].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', '),
    },
    eligibility: await eligibilityOf(payload, order),
    items: (order.items ?? []).map((i) => ({
      label: !i.variantName || i.variantName === 'Default' ? (i.title ?? '') : `${i.title} — ${i.variantName}`,
      qty: i.qty ?? 0,
      lineTotal: (i.unitPrice ?? 0) * (i.qty ?? 0),
    })),
    totals: {
      shippingFee: order.shippingFee ?? 0,
      codeDiscount: order.codeDiscount ?? 0,
      prepaidDiscount: order.prepaidDiscount ?? 0,
      total: order.total ?? 0,
      discountCode: order.discountCode || null,
    },
    whatsapp:
      status === 'awaiting_confirmation'
        ? (() => {
            const message = codConfirmMessage(order, storeName)
            return { url: buildWhatsAppLink(phone, message), message }
          })()
        : null,
    actions: actionsOf(order),
    shipment: order.shipment?.awb
      ? {
          awb: order.shipment.awb,
          courierName: order.shipment.courierName ?? '',
          trackingUrl: order.shipment.trackingUrl ?? '',
          labelUrl: order.shipment.labelUrl || null,
        }
      : null,
    invoice: order.invoice?.number
      ? { number: order.invoice.number, url: `/api/orders/${order.id}/invoice.pdf` }
      : null,
    packingSlipUrl: `/api/orders/packing-slips?ids=${order.id}`,
    customerUrl: `${siteUrl()}${orderUrl(order.orderNumber, order.accessToken)}`,
    alerts,
    codBlocklisted: Boolean(order.codBlocklisted),
    restocked: Boolean(order.restocked),
    autoCancelLabel: autoCancelLabelOf(order, settings, now),
    dev: { simulate: canSimulateCourier() },
  }
}
