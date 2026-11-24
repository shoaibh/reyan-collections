export const ORDER_STATUSES = [
  'pending_payment',
  'awaiting_confirmation',
  'confirmed',
  'ready_to_ship',
  'shipped',
  'out_for_delivery',
  'delivered',
  'rto',
  'returned',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded', 'cod_pending', 'cod_collected'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export class InvalidTransitionError extends Error {}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['confirmed', 'cancelled'],
  awaiting_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'rto'],
  out_for_delivery: ['delivered', 'rto'],
  delivered: ['returned'],
  rto: [],
  returned: [],
  cancelled: [],
}

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  opts?: { latePayment?: boolean },
): boolean {
  if (from === 'cancelled' && to === 'confirmed') return opts?.latePayment === true
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  opts?: { latePayment?: boolean },
): void {
  if (!canTransition(from, to, opts)) {
    throw new InvalidTransitionError(`Cannot move an order from ${from} to ${to}`)
  }
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[from]]
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Payment pending',
  awaiting_confirmation: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  ready_to_ship: 'Ready to ship',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  rto: 'Returned to us',
  returned: 'Returned',
  cancelled: 'Cancelled',
}

/** The customer-facing name of a status, used in admin error messages. */
export const statusLabel = (status: OrderStatus): string => STATUS_LABELS[status]
