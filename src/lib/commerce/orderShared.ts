// Leaf helpers shared by orderActions, payments and checkout. Import from here inside this folder to avoid cycles.
import { sql } from '@payloadcms/db-postgres'

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
