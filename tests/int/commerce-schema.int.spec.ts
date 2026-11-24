import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seed, wipe } from '@/seed'
import { seedDiscountCode } from '@/seed/data'

let payload: Payload
let admin: Awaited<ReturnType<Payload['find']>>['docs'][number]

const newOrder = (n: string, total: number, status: 'confirmed' | 'cancelled') =>
  payload.create({
    collection: 'orders',
    data: {
      orderNumber: n,
      accessToken: `token-${n}`,
      status,
      paymentMethod: 'cod',
      paymentStatus: 'cod_pending',
      discountCode: 'DIWALI10',
      total,
      meta: { idempotencyKey: `key-${n}` },
    } as never,
  })

describe('commerce collections', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
    admin = (await payload.find({ collection: 'users', limit: 1 })).docs[0]!
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('hides orders, discount codes and the COD blocklist from anonymous readers', async () => {
    for (const collection of ['orders', 'discount-codes', 'cod-blocklist'] as const) {
      const result = await payload
        .find({ collection, overrideAccess: false })
        .catch((e: unknown) => (e as Error).name)
      if (typeof result === 'string') expect(result).toBe('Forbidden')
      else expect(result.docs).toHaveLength(0)
    }
  })

  it('refuses order creation through access control, even for an admin', async () => {
    await expect(
      payload.create({
        collection: 'orders',
        overrideAccess: false,
        user: admin as never,
        data: { orderNumber: 'RC-X', accessToken: 't', status: 'confirmed' } as never,
      }),
    ).rejects.toThrow(/not allowed|forbidden/i)
  })

  it('normalises discount codes, validates them and keeps them unique', async () => {
    const saved = await payload.create({
      collection: 'discount-codes',
      data: { code: ' diwali-5 ', type: 'flat', value: 5 },
    })
    expect(saved.code).toBe('DIWALI-5')
    await expect(
      payload.create({ collection: 'discount-codes', data: { code: 'DIWALI 5!', type: 'flat', value: 5 } }),
    ).rejects.toThrow()
    await expect(
      payload.create({ collection: 'discount-codes', data: { code: 'diwali10', type: 'flat', value: 5 } }),
    ).rejects.toThrow()
  })

  it('fills code usage from non-cancelled orders for admins', async () => {
    await newOrder('RC-T1', 808, 'confirmed')
    await newOrder('RC-T2', 500, 'cancelled')
    const { docs } = await payload.find({
      collection: 'discount-codes',
      where: { code: { equals: 'DIWALI10' } },
      user: admin as never,
      overrideAccess: false,
    })
    expect(docs[0]!.usage).toMatchObject({ timesUsed: 1, revenue: 808 })
  })

  it('seeds exactly the DIWALI10 sample code', async () => {
    const seeded = await payload.find({ collection: 'discount-codes', where: { code: { equals: 'DIWALI10' } } })
    expect(seeded.docs).toHaveLength(1)
    expect(seeded.docs[0]).toMatchObject({
      code: seedDiscountCode.code,
      type: 'percent',
      value: 10,
      maxDiscount: 150,
      minOrderValue: 499,
      perPhoneLimit: 1,
      active: true,
      note: 'Instagram Diwali reel',
    })
  })
})
