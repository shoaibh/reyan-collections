import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { seed } from '@/seed'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config: await config })
})

// Other int specs assume an empty catalog, so remove the seeded docs afterwards.
afterAll(async () => {
  await payload.updateGlobal({ slug: 'navigation', data: { items: [] } })
  await payload.updateGlobal({
    slug: 'homepage',
    data: { hero: { headline: 'x', productA: null, productB: null }, favouritesCollection: null },
  })
  for (const collection of ['curated', 'products', 'categories', 'pages', 'media'] as const) {
    await payload.delete({ collection, where: { id: { exists: true } } })
  }
})

describe('Seed', () => {
  it('seeds the catalog', async () => {
    await seed(payload)

    const products = await payload.find({ collection: 'products', limit: 50, depth: 0 })
    expect(products.totalDocs).toBe(5)
    expect(products.docs.every((p) => p._status === 'published')).toBe(true)

    const categories = await payload.find({ collection: 'categories', sort: 'order', limit: 10 })
    expect(categories.docs.map((c) => [c.title, c.tileColor, c.order])).toEqual([
      ['Toys & Games', 'cobalt', 1],
      ['Kitchen & Home', 'mint', 2],
    ])

    const container = await payload.find({
      collection: 'products',
      where: { slug: { equals: 'mexico-premium-container-set-of-2' } },
      depth: 0,
    })
    const variants = container.docs[0]?.variants ?? []
    expect(variants.map((v) => v.name)).toEqual(['Mint', 'Sand'])
    expect(variants.map((v) => v.stock)).toEqual([6, 3])

    const favourites = await payload.find({
      collection: 'curated',
      where: { title: { equals: "This week's favourites" } },
      depth: 0,
    })
    expect(favourites.docs[0]?.products).toHaveLength(4)

    const gifts = await payload.find({
      collection: 'curated',
      where: { title: { equals: 'Gifts under ₹499' } },
      depth: 1,
    })
    const giftProducts = (gifts.docs[0]?.products ?? []).map((p) => {
      if (typeof p === 'number') throw new Error('expected populated product')
      return p
    })
    expect(giftProducts.length).toBeGreaterThan(0)
    expect(giftProducts.every((p) => p.price <= 499)).toBe(true)

    const nav = await payload.findGlobal({ slug: 'navigation', depth: 0 })
    expect(nav.items?.map((i) => i.label)).toEqual(['Toys & Games', 'Kitchen & Home', 'Gifts under ₹499'])

    const links = await payload.findGlobal({ slug: 'links-page' })
    expect(links.buttons).toHaveLength(5)
    expect(links.buttons?.[0]?.iconType).toBe('shop')
    expect(links.buttons?.[0]?.highlight).toBe(true)

    const home = await payload.findGlobal({ slug: 'homepage', depth: 1 })
    const productA = home.hero?.productA
    expect(typeof productA === 'object' && productA?.title).toMatch(/Karaoke/)

    const pages = await payload.find({
      collection: 'pages',
      draft: true,
      limit: 20,
      pagination: false,
    })
    expect(pages.docs.map((p) => p.slug).sort()).toEqual(
      ['about', 'contact', 'privacy-policy', 'return-policy', 'shipping-policy', 'terms'].sort(),
    )
    expect(pages.docs.every((p) => p._status === 'draft')).toBe(true)
  })

  it('is idempotent', async () => {
    await seed(payload)
    const result = await seed(payload)
    expect(result).toEqual({ products: 5, categories: 2 })
    const products = await payload.count({ collection: 'products' })
    const categories = await payload.count({ collection: 'categories' })
    expect(products.totalDocs).toBe(5)
    expect(categories.totalDocs).toBe(2)
  })
})
