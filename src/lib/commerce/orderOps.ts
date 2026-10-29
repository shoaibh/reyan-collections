import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { Order } from '@/payload-types'
import { revalidate } from '@/lib/revalidate'

import { withTransaction, type SqlExecutor } from './db'
import { assertTransition, type OrderStatus } from './orderStateMachine'
import { releaseStock, type StockItem } from './stock'

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

/**
 * Cancels an order that has not been confirmed yet, putting its stock back. Returns the cancelled
 * order, or null when it is no longer pending (already paid, confirmed, or cancelled).
 */
export async function cancelPendingOrder(
  payload: Payload,
  orderId: number,
  note: string,
): Promise<Order | null> {
  const cancelled = await withTransaction(payload, async (tx) => {
    await lockOrder(tx.db, orderId)
    const order = await payload.findByID({ collection: 'orders', id: orderId, depth: 0, req: tx.req })
    if (order.status !== 'pending_payment' && order.status !== 'awaiting_confirmation') return null
    assertTransition(order.status, 'cancelled')
    const items: StockItem[] = (order.items ?? []).map((i) => ({
      productId: i.productId as number,
      variantId: i.variantId as string,
      qty: i.qty as number,
    }))
    await releaseStock(tx.db, items)
    return payload.update({
      collection: 'orders',
      id: orderId,
      depth: 0,
      req: tx.req,
      data: {
        status: 'cancelled',
        timeline: withTimelineEntry(order, { status: 'cancelled', by: 'system', note }),
      },
    })
  })
  if (cancelled) revalidate(productTags((cancelled.items ?? []).map((i) => i.slug ?? '')))
  return cancelled
}
