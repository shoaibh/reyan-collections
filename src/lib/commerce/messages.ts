import { formatINR } from '@/lib/format'
import type { Order } from '@/payload-types'

/** Short, human description of an order's items for messages: the first two, then a count of the rest. */
export function itemSummary(items: Order['items']): string {
  const list = items ?? []
  const part = (i: NonNullable<Order['items']>[number]) =>
    `${i.title}${i.variantName && i.variantName !== 'Default' ? ` (${i.variantName})` : ''}${(i.qty ?? 1) > 1 ? ` ×${i.qty}` : ''}`
  const shown = list.slice(0, 2).map(part).join(', ')
  return list.length > 2 ? `${shown} and ${list.length - 2} more` : shown
}

/** 'Priya Sharma' becomes 'Priya S.'; a single word is unchanged. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`
}

/** The WhatsApp text the owner sends to confirm a cash-on-delivery order. */
export function codConfirmMessage(order: Order, storeName: string): string {
  const firstName = (order.customer?.name ?? '').trim().split(/\s+/)[0] ?? ''
  return `Hi ${firstName}! This is ${storeName}. You ordered ${itemSummary(order.items)} (${formatINR(order.total ?? 0)}, cash on delivery) to ${order.address?.city ?? ''} ${order.address?.pincode ?? ''}. Reply YES to confirm and we'll ship it soon. Order ${order.orderNumber}.`
}
