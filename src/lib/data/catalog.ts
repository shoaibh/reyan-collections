import type { Where } from 'payload'

import type { Category, Curated, Product } from '@/payload-types'

import { cached } from './cache'
import { getClient } from './getPayloadClient'

export type ProductSort = 'featured' | 'price-asc' | 'price-desc'
export type ListProductsOptions = { categorySlug?: string; q?: string; sort?: ProductSort }

const sortField: Record<ProductSort, string> = {
  featured: 'createdAt',
  'price-asc': 'price',
  'price-desc': '-price',
}

export const MAX_QUERY_LENGTH = 80

export const normaliseQuery = (q?: string): string => (q ?? '').trim().slice(0, MAX_QUERY_LENGTH)

export const listProducts = (opts: ListProductsOptions = {}): Promise<Product[]> => {
  const q = normaliseQuery(opts.q)
  return cached(
    async () => {
      const payload = await getClient()
      const and: Where[] = []
      if (opts.categorySlug) and.push({ 'category.slug': { equals: opts.categorySlug } })
      if (q) {
        and.push({
          or: [{ title: { like: q } }, { shortDescription: { like: q } }],
        })
      }
      const { docs } = await payload.find({
        collection: 'products',
        where: and.length ? { and } : undefined,
        sort: sortField[opts.sort ?? 'featured'],
        limit: 200,
        pagination: false,
        depth: 2,
        draft: false,
        overrideAccess: false,
      })
      return docs
    },
    ['products', 'list', opts.categorySlug ?? '', q, opts.sort ?? 'featured'],
    ['products', 'categories'],
  )()
}

export const getProduct = (slug: string): Promise<Product | null> =>
  cached(
    async () => {
      const payload = await getClient()
      const { docs } = await payload.find({
        collection: 'products',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 2,
        draft: false,
        overrideAccess: false,
      })
      return docs[0] ?? null
    },
    ['product', slug],
    ['products', `product:${slug}`],
  )()

export const getCategory = (slug: string): Promise<Category | null> =>
  cached(
    async () => {
      const payload = await getClient()
      const { docs } = await payload.find({
        collection: 'categories',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 1,
        overrideAccess: false,
      })
      return docs[0] ?? null
    },
    ['category', slug],
    ['categories'],
  )()

export const listCategories = cached<Category[]>(
  async () => {
    const payload = await getClient()
    const { docs } = await payload.find({
      collection: 'categories',
      sort: 'order',
      limit: 100,
      pagination: false,
      depth: 1,
      overrideAccess: false,
    })
    return docs
  },
  ['categories', 'list'],
  ['categories'],
)

export const getCurated = (slug: string): Promise<Curated | null> =>
  cached(
    async () => {
      const payload = await getClient()
      const { docs } = await payload.find({
        collection: 'curated',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 2,
        overrideAccess: false,
      })
      return docs[0] ?? null
    },
    ['curated', slug],
    ['curated', 'products'],
  )()

export async function listRelated(product: Product, limit = 4): Promise<Product[]> {
  const all = await listProducts()
  const categoryId = typeof product.category === 'object' ? product.category.id : product.category
  const others = all.filter((p) => p.id !== product.id)
  const sameCategory = others.filter(
    (p) => (typeof p.category === 'object' ? p.category.id : p.category) === categoryId,
  )
  const rest = others.filter((p) => !sameCategory.includes(p))
  return [...sameCategory, ...rest].slice(0, limit)
}
