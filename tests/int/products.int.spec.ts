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

type FieldError = { path: string; message: string }

const fieldErrors = async (run: () => Promise<unknown>): Promise<FieldError[]> => {
  const error = await run().then(
    () => undefined,
    (e: unknown) => e as { data?: { errors?: FieldError[] } },
  )
  expect(error).toBeDefined()
  return error?.data?.errors ?? []
}

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
      await payload
        .delete({ collection: 'products', id, overrideAccess: true })
        .catch(() => undefined)
    }
    await payload
      .delete({ collection: 'categories', id: categoryId, overrideAccess: true })
      .catch(() => undefined)
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
    expect(await fieldErrors(() => create({ price: 449.5 }))).toContainEqual(
      expect.objectContaining({
        path: 'price',
        message: 'Must be a whole number of rupees',
      }),
    )
    expect(
      await fieldErrors(() => create({ variants: [{ name: 'A', stock: -1 }] })),
    ).toContainEqual(
      expect.objectContaining({
        path: 'variants.0.stock',
        message: 'Must be at least 0',
      }),
    )
    expect(
      await fieldErrors(() => create({ variants: [{ name: 'A', stock: 2.5 }] })),
    ).toContainEqual(
      expect.objectContaining({
        path: 'variants.0.stock',
        message: 'Must be a whole number of units',
      }),
    )
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
    expect(await fieldErrors(() => create({ tax: { hsnCode: '95', gstRate: 12 } }))).toContainEqual(
      expect.objectContaining({
        path: 'tax.hsnCode',
        message: 'HSN code must be 4 to 8 digits',
      }),
    )
    expect(
      await fieldErrors(() => create({ tax: { hsnCode: '3924', gstRate: 7 } })),
    ).toContainEqual(
      expect.objectContaining({
        path: 'tax.gstRate',
        message: 'GST rate must be one of 0, 5, 12, 18, 28',
      }),
    )
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

  describe('variant stock on save (R7)', () => {
    type Row = { id?: string | null; name: string; stock: number; stockAtLoad?: number }

    const createStocked = async (title: string) => {
      const doc = await create({
        title,
        variants: [
          { name: 'Mint', swatch: '#A8E6CF', stock: 6 },
          { name: 'Sand', swatch: '#E6D3A8', stock: 2 },
        ],
      })
      productIds.push(doc.id)
      return doc
    }
    const save = (id: number | string, variants: Row[], title: string) =>
      payload.update({
        collection: 'products',
        id,
        data: { title, _status: 'published', variants } as never,
        overrideAccess: true,
      })

    it('keeps live stock when the editor did not touch it', async () => {
      const doc = await createStocked('Stock Guard One')
      const [mint, sand] = doc.variants
      // Checkout decrements stock through a plain Local API update
      await payload.update({
        collection: 'products',
        id: doc.id,
        data: {
          variants: [
            { id: mint.id, name: 'Mint', stock: 4 },
            { id: sand.id, name: 'Sand', stock: 2 },
          ],
        } as never,
        overrideAccess: true,
      })
      // The editor opened the product earlier (stock 6) and saves an unrelated change
      const saved = await save(
        doc.id,
        [
          { id: mint.id, name: 'Mint', stock: 6, stockAtLoad: 6 },
          { id: sand.id, name: 'Sand', stock: 2, stockAtLoad: 2 },
        ],
        'Stock Guard Renamed',
      )
      expect(saved.title).toBe('Stock Guard Renamed')
      expect(saved.variants.find((v) => v.name === 'Mint')?.stock).toBe(4)
    })

    it('keeps an intentional stock edit', async () => {
      const doc = await createStocked('Stock Guard Two')
      const [mint, sand] = doc.variants
      await payload.update({
        collection: 'products',
        id: doc.id,
        data: {
          variants: [
            { id: mint.id, name: 'Mint', stock: 4 },
            { id: sand.id, name: 'Sand', stock: 2 },
          ],
        } as never,
        overrideAccess: true,
      })
      const saved = await save(
        doc.id,
        [
          { id: mint.id, name: 'Mint', stock: 10, stockAtLoad: 4 },
          { id: sand.id, name: 'Sand', stock: 2, stockAtLoad: 2 },
        ],
        'Stock Guard Two',
      )
      expect(saved.variants.find((v) => v.name === 'Mint')?.stock).toBe(10)
    })

    it('keeps variant row ids stable when an update omits them', async () => {
      const doc = await createStocked('Stock Guard Three')
      const saved = await save(
        doc.id,
        [
          { name: 'Mint', stock: 6 },
          { name: 'Sand', stock: 2 },
        ],
        'Stock Guard Three',
      )
      expect(saved.variants.map((v) => v.id)).toEqual(doc.variants.map((v) => v.id))
    })
  })
})
