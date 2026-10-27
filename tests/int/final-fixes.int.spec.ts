import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as getCartLines } from '@/app/(frontend)/api/cart-lines/route'
import { GET as getStock } from '@/app/(frontend)/api/stock/route'
import { listProducts } from '@/lib/data/catalog'
import { revalidate } from '@/lib/revalidate'
import { seed, wipe } from '@/seed'

vi.mock('@/lib/revalidate', () => ({ revalidate: vi.fn() }))

let payload: Payload
const tagsOf = () => (revalidate as ReturnType<typeof vi.fn>).mock.calls.flatMap((c) => c[0] as string[])

describe('final review fixes', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
  })
  afterAll(async () => {
    await wipe(payload)
  })
  beforeEach(() => vi.mocked(revalidate).mockClear())

  it('media edits revalidate every storefront tag that can embed media', async () => {
    const { docs } = await payload.find({ collection: 'media', limit: 1, depth: 0 })
    await payload.update({ collection: 'media', id: docs[0]!.id, data: { alt: 'renamed alt' } })
    const tags = tagsOf()
    for (const t of ['products', 'categories', 'curated', 'pages', 'global:homepage', 'global:navigation', 'global:links-page', 'global:store-settings']) {
      expect(tags).toContain(t)
    }
  })

  it('renaming a category, collection or page revalidates navigation', async () => {
    const cat = (await payload.find({ collection: 'categories', limit: 1, depth: 0 })).docs[0]!
    await payload.update({ collection: 'categories', id: cat.id, data: { title: cat.title } })
    expect(tagsOf()).toContain('global:navigation')
    vi.mocked(revalidate).mockClear()

    const cur = (await payload.find({ collection: 'curated', limit: 1, depth: 0 })).docs[0]
    if (cur) {
      await payload.update({ collection: 'curated', id: cur.id, data: { title: cur.title } })
      expect(tagsOf()).toContain('global:navigation')
      vi.mocked(revalidate).mockClear()
    }

    const page = (await payload.find({ collection: 'pages', limit: 1, depth: 0, draft: true })).docs[0]
    if (page) {
      await payload.update({ collection: 'pages', id: page.id, data: { title: page.title } })
      expect(tagsOf()).toContain('global:navigation')
    }
  })

  it('oversized ids return 400 on stock and cart-lines', async () => {
    const s = await getStock(new Request('http://localhost/api/stock?ids=1234567890123'))
    expect(s.status).toBe(400)
    const c = await getCartLines(new Request('http://localhost/api/cart-lines?items=1234567890123:abc'))
    expect(c.status).toBe(400)
  })

  it('search results stay correct across different queries', async () => {
    const all = await listProducts()
    const word = all[0]!.title.split(' ')[0]!
    const hits = await listProducts({ q: word })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((p) => `${p.title} ${p.shortDescription ?? ''}`.toLowerCase().includes(word.toLowerCase()))).toBe(true)
    expect(await listProducts({ q: 'zzzznomatch' })).toEqual([])
  })
})
