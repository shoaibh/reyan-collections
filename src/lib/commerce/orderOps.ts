import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { Order } from '@/payload-types'

import type { SqlExecutor } from './db'
import type { OrderStatus } from './orderStateMachine'
import type { StockItem } from './stock'

/** Serialises concurrent changes to one order (webhook, admin, expiry job) until the transaction ends. */
export async function lockOrder(db: SqlExecutor, orderId: number): Promise<void> {
  await db.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`)
}

export function withTimelineEntry(
  order: Pick<Order, 'timeline'>,
  entry: { status: OrderStatus; by: 'system' | 'admin'; note: string },
): NonNullable<Order['timeline']> {
  return [...(order.timeline ?? []), { ...entry, at: new Date().toISOString() }]
}

export const productTags = (slugs: string[]): string[] => [
  'products',
  ...slugs.filter(Boolean).map((s) => `product:${s}`),
]

export const stockItemsOf = (order: Pick<Order, 'items'>): StockItem[] =>
  (order.items ?? []).map((i) => ({
    productId: i.productId as number,
    variantId: i.variantId as string,
    qty: i.qty as number,
  }))

/**
 * Cancels an order that has not been confirmed yet, putting its stock back. Returns the cancelled
 * order, or null when it is no longer pending (already paid, confirmed, or cancelled).
 */
export async function cancelPendingOrder(
  payload: Payload,
  orderId: number,
  note: string,
): Promise<Order | null> {
  // Loaded on demand: orderActions imports the helpers above, so a static import would be circular.
  const { cancelOrder } = await import('./orderActions')
  const result = await cancelOrder(payload, orderId, {
    by: 'system',
    note,
    allowFrom: ['pending_payment', 'awaiting_confirmation'],
  })
  return result.ok && result.changed ? result.order : null
}
