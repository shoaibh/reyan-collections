import { getClient } from '@/lib/data/getPayloadClient'
import { resolveImage } from '@/lib/media'

const MAX_ITEMS = 20
const headers = { 'Cache-Control': 'no-store' }

const bad = (error: string) => Response.json({ error }, { status: 400, headers })

export type CartLineInfo = {
  productId: number
  variantId: string
  title: string | null
  variantName: string | null
  slug: string | null
  price: number | null
  image: string | null
  stock: number
  available: boolean
}

const unavailable = (productId: number, variantId: string): CartLineInfo => ({
  productId,
  variantId,
  title: null,
  variantName: null,
  slug: null,
  price: null,
  image: null,
  stock: 0,
  available: false,
})

/**
 * Resolves cart lines from `?items=<productId>:<variantId>,...` against published data only.
 * Draft-only products, unknown variants and sold-out variants come back `available: false`; an
 * unpublished product reveals nothing but its ids. Never cached.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('items') ?? ''
  const parts = raw.split(',')
  if (parts.length > MAX_ITEMS) return bad('Too many items')
  const pairs: { productId: number; variantId: string }[] = []
  for (const part of parts) {
    const match = /^([0-9]{1,12}):([A-Za-z0-9_-]{1,64})$/.exec(part)
    if (!match) return bad('Invalid items')
    pairs.push({ productId: Number(match[1]), variantId: match[2]! })
  }

  const payload = await getClient()
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { in: [...new Set(pairs.map((p) => p.productId))] } },
    limit: MAX_ITEMS,
    pagination: false,
    depth: 1,
    draft: false,
    overrideAccess: false,
  })
  const byId = new Map(docs.map((d) => [d.id, d]))

  const result = pairs.map(({ productId, variantId }): CartLineInfo => {
    const product = byId.get(productId)
    const variant = product?.variants.find((v) => v.id === variantId)
    if (!product || !variant) return unavailable(productId, variantId)
    const image =
      resolveImage(variant.images?.[0], 'thumb', product.title) ??
      resolveImage(product.images[0], 'thumb', product.title)
    return {
      productId,
      variantId,
      title: product.title,
      variantName: variant.name,
      slug: product.slug ?? null,
      price: product.price,
      image: image?.src ?? null,
      stock: variant.stock,
      available: variant.stock > 0,
    }
  })
  return Response.json(result, { headers })
}
