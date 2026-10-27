import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getCurated, getProduct, listProducts } from '@/lib/data/catalog'
import { revalidate } from '@/lib/revalidate'
import { seed, wipe } from '@/seed'

let payload: Payload

describe('storefront data layer', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('caps and trims the search query', async () => {
    expect(await listProducts({ q: 'duck' + 'x'.repeat(500) })).toHaveLength(0)
    expect(await listProducts({ q: '  duck  ' })).toHaveLength(1)
  })

  it('reads published content only, through the whole catalog journey', async () => {
    const container = await getProduct('mexico-premium-container-set-of-2')
    expect(container?.variants.map((v) => v.name)).toEqual(['Mint', 'Sand'])
    const category = container?.category
    expect(typeof category === 'object' && category?.slug).toBe('kitchen-and-home')

    const existing = await payload.find({ collection: 'products', limit: 1, depth: 0 })
    const template = existing.docs[0]!

    // never published: invisible
    const draftOnly = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: 'Secret Draft Item',
        images: template.images as never,
        price: 999,
        category: template.category as never,
        variants: [{ name: 'Default', stock: 1 }],
        tax: { hsnCode: '3924', gstRate: 12 },
        shipping: { weightGrams: 300, lengthCm: 20, widthCm: 15, heightCm: 8 },
      },
    })
    expect(await getProduct(draftOnly.slug as string)).toBeNull()
    expect((await listProducts()).map((p) => p.id)).not.toContain(draftOnly.id)

    // published "Old", then a draft "New": storefront still shows "Old"
    const published = await payload.create({
      collection: 'products',
      data: {
        title: 'Old',
        _status: 'published',
        images: template.images as never,
        price: 999,
        category: template.category as never,
        variants: [{ name: 'Default', stock: 1 }],
        tax: { hsnCode: '3924', gstRate: 12 },
        shipping: { weightGrams: 300, lengthCm: 20, widthCm: 15, heightCm: 8 },
      },
    })
    await payload.update({ collection: 'products', id: published.id, draft: true, data: { title: 'New' } })
    expect((await getProduct(published.slug as string))?.title).toBe('Old')

    // filters and sorting
    const kitchen = await listProducts({ categorySlug: 'kitchen-and-home' })
    expect(kitchen.map((p) => p.title).sort()).toEqual([
      'Mexico premium container, set of 2',
      'Portable juicer, 400 ml, USB charging',
    ])
    expect(await listProducts({ q: 'duck' })).toHaveLength(1)
    expect((await listProducts({ sort: 'price-asc' }))[0]?.price).toBe(449)

    // curated keeps its order
    const curated = await getCurated('this-weeks-favourites')
    const favourites = await payload.find({
      collection: 'curated',
      where: { slug: { equals: 'this-weeks-favourites' } },
      depth: 0,
    })
    expect(curated?.products).toHaveLength(4)
    expect((curated?.products ?? []).map((p) => (typeof p === 'object' ? p.id : p))).toEqual(
      favourites.docs[0]?.products,
    )
  })

  it('revalidate is a silent no-op outside Next', () => {
    expect(() => revalidate(['products'])).not.toThrow()
  })
})
