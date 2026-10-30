import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import { drizzleFor, withTransaction } from '@/lib/commerce/db'
import { nextNumber } from '@/lib/commerce/counters'
import { hitRateLimit } from '@/lib/commerce/rateLimit'
import { loadCommerceSettings } from '@/lib/commerce/settings'
import { releaseStock, reserveStock } from '@/lib/commerce/stock'
import { seed, wipe } from '@/seed'

let payload: Payload
let productId: number
let mintId: string
let sandId: string

const stockOf = async (variantId: string): Promise<number> => {
  const db = await drizzleFor(payload)
  const r = await db.execute(sql`SELECT stock::int AS stock FROM products_variants WHERE id = ${variantId}`)
  return Number(r.rows[0]!.stock)
}

describe('commerce infrastructure', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
    const { docs } = await payload.find({
      collection: 'products',
      where: { slug: { equals: 'mexico-premium-container-set-of-2' } },
      limit: 1,
      depth: 0,
    })
    productId = docs[0]!.id as number
    mintId = docs[0]!.variants!.find((v) => v.name === 'Mint')!.id!
    sandId = docs[0]!.variants!.find((v) => v.name === 'Sand')!.id!
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('stock, concurrency, counters, rate limits and settings behave as one infra', async () => {
    const mint0 = await stockOf(mintId)
    const sand0 = await stockOf(sandId)
    expect(sand0).toBe(3)

    // reserve both
    const ok = await withTransaction(payload, (tx) =>
      reserveStock(tx.db, [
        { productId, variantId: mintId, qty: 2 },
        { productId, variantId: sandId, qty: 1 },
      ]),
    )
    expect(ok).toEqual({ ok: true })
    expect(await stockOf(mintId)).toBe(mint0 - 2)
    expect(await stockOf(sandId)).toBe(sand0 - 1)

    // release restores
    const db = await drizzleFor(payload)
    await releaseStock(db, [
      { productId, variantId: mintId, qty: 2 },
      { productId, variantId: sandId, qty: 1 },
    ])
    expect(await stockOf(mintId)).toBe(mint0)
    expect(await stockOf(sandId)).toBe(sand0)

    // partial failure: Sand fails, Mint is rolled back inside the same call
    const bad = await withTransaction(payload, (tx) =>
      reserveStock(tx.db, [
        { productId, variantId: mintId, qty: 1 },
        { productId, variantId: sandId, qty: 99 },
      ]),
    )
    expect(bad).toEqual({ ok: false, productId, variantId: sandId, available: 3 })
    expect(await stockOf(mintId)).toBe(mint0)

    // concurrency on the last unit
    await db.execute(sql`UPDATE products_variants SET stock = 1 WHERE id = ${sandId}`)
    const results = await Promise.all([
      withTransaction(payload, (tx) => reserveStock(tx.db, [{ productId, variantId: sandId, qty: 1 }])),
      withTransaction(payload, (tx) => reserveStock(tx.db, [{ productId, variantId: sandId, qty: 1 }])),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await stockOf(sandId)).toBe(0)
    await db.execute(sql`UPDATE products_variants SET stock = 3 WHERE id = ${sandId}`)

    // counters: gapless across a rollback
    expect(await nextNumber(db, 'order', 1000)).toBe(1001)
    expect(await nextNumber(db, 'order', 1000)).toBe(1002)
    await expect(
      withTransaction(payload, async (tx) => {
        await nextNumber(tx.db, 'order', 1000)
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await nextNumber(db, 'order', 1000)).toBe(1003)

    // rate limits
    const opts = { limit: 2, windowMs: 60_000 }
    expect(await hitRateLimit(payload, 'infra-a', opts)).toBe(true)
    expect(await hitRateLimit(payload, 'infra-a', opts)).toBe(true)
    expect(await hitRateLimit(payload, 'infra-a', opts)).toBe(false)
    expect(await hitRateLimit(payload, 'infra-b', opts)).toBe(true)
    await db.execute(sql`UPDATE rate_limits SET created_at = now() - interval '2 hours' WHERE key = 'infra-a'`)
    expect(await hitRateLimit(payload, 'infra-a', opts)).toBe(true)

    // parallel hits on one key cannot exceed the limit
    const burst = await Promise.all(Array.from({ length: 5 }, () => hitRateLimit(payload, 'infra-par', opts)))
    expect(burst.filter(Boolean)).toHaveLength(2)

    // settings
    expect(await loadCommerceSettings(payload)).toMatchObject({
      shippingFee: 49,
      freeShippingAbove: 499,
      prepaidDiscount: 0,
      codMaxOrderValue: 2000,
      maxPerOrder: 5,
    })
  })

  describe('latest-version stock sync', () => {
    const stocksOf = async (): Promise<{ live: number; version: number }> => {
      const live = await payload.findByID({ collection: 'products', id: productId, draft: false, depth: 0 })
      const ver = await payload.findByID({ collection: 'products', id: productId, draft: true, depth: 0 })
      return {
        live: live.variants!.find((v) => v.id === mintId)!.stock,
        version: ver.variants!.find((v) => v.id === mintId)!.stock,
      }
    }

    it('reserveStock lowers both live and latest-version stock', async () => {
      const db = await drizzleFor(payload)
      try {
        await withTransaction(payload, (tx) => reserveStock(tx.db, [{ productId, variantId: mintId, qty: 2 }]))
        expect(await stocksOf()).toEqual({ live: 4, version: 4 })
      } finally {
        await releaseStock(db, [{ productId, variantId: mintId, qty: 2 }])
      }
    })

    it('releaseStock restores both live and latest-version stock', async () => {
      const db = await drizzleFor(payload)
      await withTransaction(payload, (tx) => reserveStock(tx.db, [{ productId, variantId: mintId, qty: 2 }]))
      await releaseStock(db, [{ productId, variantId: mintId, qty: 2 }])
      expect(await stocksOf()).toEqual({ live: 6, version: 6 })
    })

    it('a failed reservation leaves live and latest-version stock unchanged', async () => {
      const bad = await withTransaction(payload, (tx) =>
        reserveStock(tx.db, [
          { productId, variantId: mintId, qty: 1 },
          { productId, variantId: sandId, qty: 99 },
        ]),
      )
      expect(bad.ok).toBe(false)
      expect(await stocksOf()).toEqual({ live: 6, version: 6 })
    })

    it('the owner can re-set stock to the number shown on the edit screen after a sale', async () => {
      const db = await drizzleFor(payload)
      try {
        await withTransaction(payload, (tx) => reserveStock(tx.db, [{ productId, variantId: mintId, qty: 2 }]))
        expect(await stocksOf()).toEqual({ live: 4, version: 4 })
        const shown = await payload.findByID({ collection: 'products', id: productId, draft: true, depth: 0 })
        await payload.update({
          collection: 'products',
          id: productId,
          draft: false,
          depth: 0,
          data: {
            _status: 'published',
            variants: shown.variants!.map((v) =>
              v.id === mintId ? { ...v, stock: 6, stockAtLoad: 4 } : { ...v, stockAtLoad: v.stock },
            ),
          },
        })
        expect((await stocksOf()).live).toBe(6)
      } finally {
        await db.execute(sql`UPDATE products_variants SET stock = 6 WHERE id = ${mintId}`)
        await db.execute(
          sql`UPDATE _products_v_version_variants SET stock = 6 WHERE _uuid = ${mintId}`,
        )
      }
    })
  })
})
