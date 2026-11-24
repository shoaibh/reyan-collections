import type { Order } from '@/payload-types'
import { getRazorpay } from '@/lib/integrations/razorpay'

export type PaymentLaunch = {
  mode: 'mock' | 'live'
  keyId: string
  razorpayOrderId: string
  amountPaise: number
  currency: 'INR'
  orderNumber: string
  orderUrl: string
  prefill: { name: string; contact: string; email?: string }
}

export const orderUrl = (orderNumber: string, token: string): string => `/order/${orderNumber}?t=${token}`

/** What the browser needs to open Razorpay. Only for unpaid prepaid orders that have a Razorpay order. */
export function buildPaymentLaunch(order: Order): PaymentLaunch | null {
  const razorpayOrderId = order.razorpay?.orderId
  if (order.status !== 'pending_payment' || !razorpayOrderId) return null
  const razorpay = getRazorpay()
  const email = order.customer?.email
  return {
    mode: razorpay.mode,
    keyId: razorpay.keyId,
    razorpayOrderId,
    amountPaise: (order.total ?? 0) * 100,
    currency: 'INR',
    orderNumber: order.orderNumber,
    orderUrl: orderUrl(order.orderNumber, order.accessToken),
    prefill: {
      name: order.customer?.name ?? '',
      contact: order.customer?.phone ?? '',
      ...(email ? { email } : {}),
    },
  }
}
