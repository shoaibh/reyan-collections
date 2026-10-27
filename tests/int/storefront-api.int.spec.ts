import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { GET as getServiceability } from '@/app/(frontend)/api/serviceability/route'
import { GET as getStock } from '@/app/(frontend)/api/stock/route'
import { seed, wipe } from '@/seed'

let payload: Payload

const stock = (ids: string) => getStock(new Request(`http://localhost/api/stock?ids=${ids}`))
const serviceability = (query: string) =>
  getServiceability(new Request(`http://localhost/api/serviceability?${query}`))

describe('storefront API routes', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('serves live published stock and never leaks drafts', async () => {
    const { docs } = await payload.find({
      collection: 'products',
      where: { slug: { equals: 'mexico-premium-container-set-of-2' } },
      limit: 1,
      depth: 0,
    })
    const container = docs[0]!
    const template = container

    const draftOnly = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: 'Hidden Stock Item',
        images: template.images as never,
        price: 999,
        category: template.category as never,
        variants: [{ name: 'Default', stock: 9 }],
        tax: { hsnCode: '3924', gstRate: 12 },
        shipping: { weightGrams: 300, lengthCm: 20, widthCm: 15, heightCm: 8 },
      },
    })

    const res = await stock(`${container.id},${draftOnly.id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await res.json()) as Record<string, Record<string, number>>
    const byName = Object.fromEntries(
      container.variants.map((v) => [v.name, body[String(container.id)]?.[v.id as string]]),
    )
    expect(byName).toEqual({ Mint: 6, Sand: 3 })
    expect(Object.keys(body)).not.toContain(String(draftOnly.id))

    // Bad input
    expect((await stock('abc')).status).toBe(400)
    expect((await stock('')).status).toBe(400)
    const tooMany = Array.from({ length: 21 }, (_, i) => i + 1).join(',')
    expect((await stock(tooMany)).status).toBe(400)
  })

  it('checks serviceability through the mock', async () => {
    const ok = await serviceability('pincode=226010&weight=800')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(await ok.json()).toMatchObject({
      serviceable: true,
      codAvailable: true,
      etaDays: { min: 3, max: 5 },
    })

    const prepaid = await serviceability('pincode=111111&weight=800')
    expect(await prepaid.json()).toMatchObject({ serviceable: true, codAvailable: false })

    const none = await serviceability('pincode=000000&weight=800')
    expect(none.status).toBe(200)
    expect(await none.json()).toMatchObject({ serviceable: false })

    expect((await serviceability('pincode=12345&weight=800')).status).toBe(400)
    expect((await serviceability('pincode=226010&weight=abc')).status).toBe(400)
  })
})
