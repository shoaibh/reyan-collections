import { sql } from '@payloadcms/db-postgres'

import type { SqlExecutor } from './db'

export type StockItem = { productId: number; variantId: string; qty: number }
export type ReserveResult =
  | { ok: true }
  | { ok: false; productId: number; variantId: string; available: number }

/**
 * Applies the same delta to the product's latest saved version, which the admin edit screen loads.
 * Rows link through `_uuid` (the main table's variant id). No matching row (variant added after the
 * latest version, or never versioned) simply updates nothing.
 */
async function syncLatestVersion(db: SqlExecutor, productId: number, variantId: string, delta: number) {
  await db.execute(
    sql`UPDATE _products_v_version_variants AS vv SET stock = vv.stock + ${delta} FROM _products_v AS v WHERE vv._parent_id = v.id AND v.parent_id = ${productId} AND v.latest = true AND vv._uuid = ${variantId}`,
  )
}

export async function releaseStock(db: SqlExecutor, items: StockItem[]): Promise<void> {
  for (const { productId, variantId, qty } of items) {
    const res = await db.execute(
      sql`UPDATE products_variants SET stock = stock + ${qty} WHERE id = ${variantId} AND _parent_id = ${productId} RETURNING id`,
    )
    if (res.rows.length > 0) await syncLatestVersion(db, productId, variantId, qty)
  }
}

/**
 * Atomically takes stock from variant rows. Items are locked in variantId order to avoid
 * deadlocks. On the first shortfall, anything reserved by this call is put back so the
 * caller's transaction stays usable.
 */
export async function reserveStock(db: SqlExecutor, items: StockItem[]): Promise<ReserveResult> {
  const sorted = [...items].sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0))
  const reserved: StockItem[] = []
  for (const item of sorted) {
    const { productId, variantId, qty } = item
    const res = await db.execute(
      sql`UPDATE products_variants SET stock = stock - ${qty} WHERE id = ${variantId} AND _parent_id = ${productId} AND stock >= ${qty} RETURNING stock`,
    )
    if (res.rows.length === 0) {
      await releaseStock(db, reserved)
      const cur = await db.execute(
        sql`SELECT stock::int AS stock FROM products_variants WHERE id = ${variantId} AND _parent_id = ${productId}`,
      )
      return { ok: false, productId, variantId, available: cur.rows[0] ? Number(cur.rows[0].stock) : 0 }
    }
    await syncLatestVersion(db, productId, variantId, -qty)
    reserved.push(item)
  }
  return { ok: true }
}
