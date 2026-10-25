import path from 'node:path'
import type { Payload } from 'payload'

import { announcements, heroData, linksData, seedCategories, seedProducts } from './data'
import { lexicalDoc } from './lexical'
import { seedPages } from './pages'

const ASSET_DIR = path.resolve(process.cwd(), 'src/seed/assets')
const LISTING_URL = 'https://example.com/listing'
const CHECKED_ON = '2026-10-26'
const FAVOURITES_TITLE = "This week's favourites"
const GIFTS_TITLE = 'Gifts under ₹499'

async function wipe(payload: Payload) {
  // Clear global relations first so nothing references the docs being deleted.
  await payload.updateGlobal({ slug: 'navigation', data: { items: [] } })
  await payload.updateGlobal({
    slug: 'homepage',
    data: {
      hero: { headline: heroData.headline, productA: null, productB: null },
      favouritesCollection: null,
    },
  })
  for (const collection of ['curated', 'products', 'categories', 'pages', 'media'] as const) {
    await payload.delete({ collection, where: { id: { exists: true } } })
  }
}

async function upsertAdmin(payload: Payload) {
  const email = process.env.SEED_ADMIN_EMAIL
  const password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to run the seed')
  }
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })
  const id = existing.docs[0]?.id
  if (id === undefined) {
    await payload.create({ collection: 'users', data: { email, password, role: 'owner' } })
  } else {
    await payload.update({ collection: 'users', id, data: { password } })
  }
}

export async function seed(payload: Payload): Promise<{ products: number; categories: number }> {
  // Fail fast, before wiping anything, if credentials are missing.
  if (!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to run the seed')
  }

  await wipe(payload)
  await upsertAdmin(payload)

  const categoryIds = new Map<string, number>()
  for (const category of seedCategories) {
    const doc = await payload.create({
      collection: 'categories',
      data: { title: category.title, tileColor: category.tileColor, order: category.order },
    })
    categoryIds.set(category.key, doc.id)
  }

  const products = []
  for (const item of seedProducts) {
    const media = await payload.create({
      collection: 'media',
      data: { alt: item.title },
      filePath: path.join(ASSET_DIR, item.asset),
    })
    const category = categoryIds.get(item.category)
    if (category === undefined) throw new Error(`Unknown category ${item.category}`)
    const product = await payload.create({
      collection: 'products',
      data: {
        title: item.title,
        _status: 'published',
        images: [media.id],
        price: item.price,
        compareAt: {
          marketplace: item.compareAt.marketplace,
          price: item.compareAt.price,
          url: LISTING_URL,
          checkedOn: CHECKED_ON,
        },
        variants: item.variants,
        badge: item.badge,
        category,
        shortDescription: item.shortDescription,
        description: lexicalDoc([{ type: 'p', text: item.shortDescription }]),
        highlights: item.highlights.map((text) => ({ text })),
        ageGroup: item.ageGroup,
        tax: { hsnCode: item.hsnCode, gstRate: item.gstRate },
        shipping: item.shipping,
      },
    })
    products.push(product)
  }

  const favourites = await payload.create({
    collection: 'curated',
    data: {
      title: FAVOURITES_TITLE,
      order: 1,
      products: products.slice(0, 4).map((p) => p.id),
    },
  })
  const gifts = await payload.create({
    collection: 'curated',
    data: {
      title: GIFTS_TITLE,
      order: 2,
      products: products.filter((p) => p.price <= 499).map((p) => p.id),
    },
  })

  for (const page of seedPages) {
    await payload.create({ collection: 'pages', data: page, draft: true })
  }

  const [toys, home] = [categoryIds.get('toys'), categoryIds.get('home')]
  if (toys === undefined || home === undefined) throw new Error('Categories were not created')

  await payload.updateGlobal({
    slug: 'navigation',
    data: {
      items: [
        { label: 'Toys & Games', linkType: 'category', category: toys },
        { label: 'Kitchen & Home', linkType: 'category', category: home },
        { label: GIFTS_TITLE, linkType: 'collection', collection: gifts.id },
      ],
    },
  })

  await payload.updateGlobal({ slug: 'links-page', data: { ...linksData, buttons: [...linksData.buttons] } })

  const [productA, productB] = [products[0], products[2]]
  if (!productA || !productB) throw new Error('Hero products were not created')
  await payload.updateGlobal({
    slug: 'homepage',
    data: {
      _status: 'published',
      announcement: announcements.map((text) => ({ text })),
      hero: { ...heroData, productA: productA.id, productB: productB.id },
      favouritesCollection: favourites.id,
    },
  })

  const [productCount, categoryCount] = await Promise.all([
    payload.count({ collection: 'products' }),
    payload.count({ collection: 'categories' }),
  ])
  return { products: productCount.totalDocs, categories: categoryCount.totalDocs }
}
