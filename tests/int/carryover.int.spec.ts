import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from '@payloadcms/db-postgres'

import { GET as getServiceability } from '@/app/(frontend)/api/serviceability/route'
import { drizzleFor } from '@/lib/commerce/db'
import { mockShiprocket } from '@/lib/integrations/shiprocket/mock'
import { seed, wipe } from '@/seed'

let payload: Payload

const SLUG = 'mexico-premium-container-set-of-2'

describe('plan 2 carry-over fixes', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('R8: publishing a stale draft keeps live stock', async () => {
    const { docs } = await payload.find({
      collection: 'products',
      where: { slug: { equals: SLUG } },
      limit: 1,
      depth: 0,
    })
    const live = docs[0]!
    await payload.update({
      collection: 'products',
      id: live.id,
      draft: true,
      data: { shortDescription: 'Edited in a draft' },
    })

    const mint = live.variants!.find((v) => v.name === 'Mint')!
    expect(mint.stock).toBe(6)
    // A customer buys 2 Mint while the draft sits open
    const db = await drizzleFor(payload)
    await db.execute(sql`UPDATE products_variants SET stock = stock - 2 WHERE id = ${mint.id}`)

    const draft = await payload.findByID({ collection: 'products', id: live.id, draft: true, depth: 0 })
    const variants = draft.variants!.map((v) => ({ ...v, stockAtLoad: v.stock }))
    await payload.update({
      collection: 'products',
      id: live.id,
      data: { _status: 'published', variants },
    })

    const afterFirst = await payload.findByID({ collection: 'products', id: live.id, draft: false, depth: 0 })
    expect(afterFirst.variants!.find((v) => v.name === 'Mint')!.stock).toBe(4)

    const reloaded = await payload.findByID({ collection: 'products', id: live.id, draft: true, depth: 0 })
    const edited = reloaded.variants!.map((v) =>
      v.name === 'Mint' ? { ...v, stock: 9, stockAtLoad: 4 } : { ...v, stockAtLoad: v.stock },
    )
    await payload.update({
      collection: 'products',
      id: live.id,
      data: { _status: 'published', variants: edited },
    })
    const afterSecond = await payload.findByID({ collection: 'products', id: live.id, draft: false, depth: 0 })
    expect(afterSecond.variants!.find((v) => v.name === 'Mint')!.stock).toBe(9)
  })

  it('pickup pincode is read server-side', async () => {
    const spy = vi.spyOn(mockShiprocket, 'checkServiceability')
    const previous = await payload.findGlobal({ slug: 'store-settings', depth: 0 })
    const call = () =>
      getServiceability(new Request('http://localhost/api/serviceability?pincode=400001&weight=500'))
    const setBusiness = (business: Record<string, unknown>) =>
      payload.updateGlobal({ slug: 'store-settings', data: { business } as never })

    try {
      await setBusiness({
        pickupSameAsBusiness: false,
        pickupAddress: { pincode: '226010' },
        address: { pincode: '226001' },
      })
      const res = await call()
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ pickupPincode: '226010' }))
      expect(await res.json()).not.toHaveProperty('pickupPincode')

      await setBusiness({ pickupSameAsBusiness: true, pickupAddress: { pincode: '226010' }, address: { pincode: '226001' } })
      await call()
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ pickupPincode: '226001' }))

      await setBusiness({ pickupSameAsBusiness: true, pickupAddress: { pincode: '' }, address: { pincode: '' } })
      await call()
      expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ pickupPincode: '110001' }))
    } finally {
      await payload.updateGlobal({
        slug: 'store-settings',
        data: { business: previous.business } as never,
      })
      spy.mockRestore()
    }
  })
})
