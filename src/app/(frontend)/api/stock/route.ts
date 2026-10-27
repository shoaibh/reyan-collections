import { getClient } from '@/lib/data/getPayloadClient'

const MAX_IDS = 20
const headers = { 'Cache-Control': 'no-store' }

const bad = (error: string) => Response.json({ error }, { status: 400, headers })

/** Live published variant stock: `{ [productId]: { [variantId]: stock } }`. Never cached, never drafts. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('ids') ?? ''
  const parts = raw.split(',')
  if (parts.length > MAX_IDS) return bad('Too many ids')
  if (!parts.every((p) => /^[0-9]+$/.test(p))) return bad('Invalid ids')
  const ids = [...new Set(parts.map(Number))]

  const payload = await getClient()
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { in: ids } },
    limit: MAX_IDS,
    pagination: false,
    depth: 0,
    draft: false,
    overrideAccess: false,
  })

  const result: Record<string, Record<string, number>> = {}
  for (const product of docs) {
    result[String(product.id)] = Object.fromEntries(
      product.variants.flatMap((v) => (v.id ? [[v.id, v.stock]] : [])),
    )
  }
  return Response.json(result, { headers })
}
