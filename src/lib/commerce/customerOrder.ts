import { timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import { maskPhone, normalizePhone } from '@/lib/india'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import type { Order } from '@/payload-types'

import type { OrderStatus } from './orderStateMachine'
import { buildPaymentLaunch, orderUrl, type PaymentLaunch } from './paymentLaunch'
import type { PaymentMethod, Totals } from './pricing'
import { loadCommerceSettings } from './settings'

export type CustomerPaymentLaunch = Omit<PaymentLaunch, 'prefill'> & { prefill: { name: string } }

export type CustomerOrderView = {
  orderNumber: string
  status: OrderStatus
  heading: string
  message: string | null
  paymentLabel: string
  paymentMethod: PaymentMethod
  createdAt: string
  items: { label: string; qty: number; lineTotal: number }[]
  totals: Pick<Totals, 'subtotal' | 'codeDiscount' | 'shippingFee' | 'prepaidDiscount' | 'total'>
  discountCode: string | null
  shipTo: { name: string; phone: string; place: string }
  step: 0 | 1 | 2 | 3
  trackingUrl: string | null
  payment: CustomerPaymentLaunch | null
  whatsappUrl: string | null
}

const HEADINGS: Record<OrderStatus, string> = {
  pending_payment: 'Payment pending',
  awaiting_confirmation: 'Order received',
  confirmed: 'Order confirmed',
  ready_to_ship: 'Order confirmed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rto: 'Returned to us',
  returned: 'Returned',
}

const STEPS: Partial<Record<OrderStatus, 0 | 1 | 2 | 3>> = {
  pending_payment: 0,
  awaiting_confirmation: 0,
  confirmed: 1,
  ready_to_ship: 1,
  shipped: 2,
  out_for_delivery: 2,
  delivered: 3,
}

function stepFor(order: Order): 0 | 1 | 2 | 3 {
  const direct = STEPS[order.status]
  if (direct !== undefined) return direct
  // cancelled / rto / returned keep the furthest step the order reached
  let step: 0 | 1 | 2 | 3 = 0
  for (const entry of order.timeline ?? []) {
    const s = STEPS[entry.status as OrderStatus]
    if (s !== undefined && s > step) step = s
  }
  return step
}

function paymentLabelFor(order: Order): string {
  if (order.paymentStatus === 'refunded') return 'Refunded'
  if (order.paymentMethod === 'cod') return 'Cash on delivery'
  if (order.paymentStatus === 'paid') return 'Paid online'
  return 'Payment pending'
}

/** The browser only needs the first name-level prefill; phone and email stay on the server. */
function customerPayment(launch: PaymentLaunch | null): CustomerPaymentLaunch | null {
  return launch ? { ...launch, prefill: { name: launch.prefill.name } } : null
}

function tokenMatches(actual: string, given: string | null): boolean {
  if (!given) return false
  const a = Buffer.from(actual)
  const b = Buffer.from(given)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

async function findByNumber(payload: Payload, orderNumber: string): Promise<Order | null> {
  const { docs } = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    limit: 1,
    depth: 0,
  })
  return docs[0] ?? null
}

export async function getOrderForCustomer(
  payload: Payload,
  orderNumber: string,
  token: string | null,
): Promise<CustomerOrderView | null> {
  const order = await findByNumber(payload, orderNumber)
  if (!order || !tokenMatches(order.accessToken, token)) return null

  const settings = await loadCommerceSettings(payload)
  const status = order.status
  let message: string | null = null
  if (status === 'pending_payment') {
    message = `We haven't received your payment yet. Complete it within ${settings.pendingPaymentMinutes} minutes to keep your items.`
  } else if (status === 'awaiting_confirmation') {
    message = "We'll WhatsApp you shortly to confirm your order."
  } else if (status === 'confirmed') {
    message = "Thanks! We'll pack your order soon."
  }

  const trackingUrl = order.shipment?.trackingUrl || null
  const address = order.address
  return {
    orderNumber: order.orderNumber,
    status,
    heading: HEADINGS[status],
    message,
    paymentLabel: paymentLabelFor(order),
    paymentMethod: order.paymentMethod ?? 'prepaid',
    createdAt: order.createdAt,
    items: (order.items ?? []).map((i) => ({
      label:
        !i.variantName || i.variantName === 'Default'
          ? (i.title ?? '')
          : `${i.title} — ${i.variantName}`,
      qty: i.qty ?? 0,
      lineTotal: (i.unitPrice ?? 0) * (i.qty ?? 0),
    })),
    totals: {
      subtotal: order.subtotal ?? 0,
      codeDiscount: order.codeDiscount ?? 0,
      shippingFee: order.shippingFee ?? 0,
      prepaidDiscount: order.prepaidDiscount ?? 0,
      total: order.total ?? 0,
    },
    discountCode: order.discountCode || null,
    shipTo: {
      name: order.customer?.name ?? '',
      phone: maskPhone(order.customer?.phone ?? ''),
      place: `${address?.city ?? ''}, ${address?.state ?? ''} ${address?.pincode ?? ''}`.trim(),
    },
    step: stepFor(order),
    trackingUrl,
    payment: customerPayment(buildPaymentLaunch(order)),
    whatsappUrl: settings.whatsappNumber
      ? buildWhatsAppLink(
          settings.whatsappNumber,
          `Hi, I have a question about my order ${order.orderNumber}`,
        )
      : null,
  }
}

/** Order number plus the phone it was placed with unlock the order link. */
export async function findOrderUrl(
  payload: Payload,
  orderNumber: string,
  phone: string,
): Promise<string | null> {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const order = await findByNumber(payload, orderNumber.trim().toUpperCase())
  if (!order || order.customer?.phone !== normalized) return null
  return orderUrl(order.orderNumber, order.accessToken)
}
