import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
let mediaId: number | string
let categoryId: number | string
const productIds: (number | string)[] = []

const validData = (overrides: Record<string, unknown> = {}) =>
  ({
    title: 'Mint Lunch Box',
    _status: 'published',
    images: [mediaId],
    price: 449,
    category: categoryId,
    variants: [
      { name: 'Mint', swatch: '#A8E6CF', stock: 4 },
      { name: 'Sand', swatch: '#E6D3A8', stock: 0 },
    ],
    tax: { hsnCode: '3924', gstRate: 12 },
    shipping: { weightGrams: 300, lengthCm: 20, widthCm: 15, heightCm: 8 },
    ...overrides,
  }) as never

const create = (overrides: Record<string, unknown> = {}) =>
  payload.create({ collection: 'products', data: validData(overrides), overrideAccess: true })

describe('Products', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'sample' },
      filePath: 'tests/fixtures/sample.jpg',
    })
    mediaId = media.id
    const category = await payload.create({
      collection: 'categories',
      data: { title: 'Products Test Category', tileColor: 'mint' },
      overrideAccess: true,
    })
    categoryId = category.id
  })

  afterAll(async () => {
    for (const id of productIds) {
      await payload.delete({ collection: 'products', id, overrideAccess: true }).catch(() => undefined)
    }
    await payload.delete({ collection: 'categories', id: categoryId, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'media', id: mediaId }).catch(() => undefined)
  })

  it('saves a valid product with two variants', async () => {
    const doc = await create()
    productIds.push(doc.id)
    expect(doc.variants.length).toBe(2)
    for (const row of doc.variants) expect(typeof row.id).toBe('string')
  })

  it('requires at least one variant', async () => {
    await expect(create({ variants: [] })).rejects.toThrow()
  })

  it('rejects decimal or negative money and stock', async () => {
    await expect(create({ price: 449.5 })).rejects.toThrow()
    await expect(create({ variants: [{ name: 'A', stock: -1 }] })).rejects.toThrow()
    await expect(create({ variants: [{ name: 'A', stock: 2.5 }] })).rejects.toThrow()
  })

  it('rejects a comparison without proof', async () => {
    let error: { data?: { errors?: { path: string }[] } } | undefined
    try {
      await create({ compareAt: { price: 549 } })
    } catch (e) {
      error = e as typeof error
    }
    expect(error).toBeDefined()
    const paths = (error?.data?.errors ?? []).map((e) => e.path)
    expect(paths).toContain('compareAt.marketplace')
    expect(paths).toContain('compareAt.url')
    expect(paths).toContain('compareAt.checkedOn')
  })

  it('validates tax fields', async () => {
    await expect(create({ tax: { hsnCode: '95', gstRate: 12 } })).rejects.toThrow()
    await expect(create({ tax: { hsnCode: '3924', gstRate: 7 } })).rejects.toThrow()
  })

  it('blocks deleting a category in use', async () => {
    const cat = await payload.create({
      collection: 'categories',
      data: { title: 'In Use Category', tileColor: 'sun' },
      overrideAccess: true,
    })
    const product = await create({ category: cat.id, title: 'Guarded Product' })
    productIds.push(product.id)
    await expect(
      payload.delete({ collection: 'categories', id: cat.id, overrideAccess: true }),
    ).rejects.toThrow(/used by 1 product/)
    await payload.delete({ collection: 'products', id: product.id, overrideAccess: true })
    await payload.delete({ collection: 'categories', id: cat.id, overrideAccess: true })
  })
})
