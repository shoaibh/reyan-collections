import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { User } from '@/payload-types'

let payload: Payload

// A missing global also throws, so rejections must be validation errors, not "global not found".
const expectValidationError = async (run: () => Promise<unknown>, fieldPath: string) => {
  const error = await run().then(
    () => undefined,
    (err: unknown) => err as Error & { data?: { errors?: { path: string; message: string }[] } },
  )
  expect(error).toBeInstanceOf(Error)
  expect(error?.message).not.toMatch(/can't be found/)
  expect(error?.data?.errors?.map((e) => e.path)).toContain(fieldPath)
}

let adminUser: User

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  adminUser = await payload.create({
    collection: 'users',
    data: { email: 'globals-admin@example.com', password: 'test-pass-123', role: 'owner' },
  })
})

afterAll(async () => {
  await payload.delete({ collection: 'users', id: adminUser.id }).catch(() => undefined)
})

describe('Globals', () => {
  it('applies store-settings defaults', async () => {
    const settings = await payload.findGlobal({ slug: 'store-settings' })
    expect(settings.commerce?.shippingFee).toBe(49)
    expect(settings.commerce?.freeShippingAbove).toBe(499)
    expect(settings.commerce?.codMaxOrderValue).toBe(2000)
    expect(settings.commerce?.maxPerOrder).toBe(5)
    expect(settings.commerce?.returnWindowDays).toBe(7)
    expect(settings.timeouts?.pendingPaymentMinutes).toBe(30)
    expect(settings.timeouts?.codConfirmHours).toBe(24)
    expect(settings.invoicing?.invoicePrefix).toBe('RC')
    expect(settings.business?.name).toBe('Reyan Collections')
  })

  it('caps navigation at 4 items', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ label: `Shop ${i + 1}`, linkType: 'shop' }))
    await expectValidationError(() =>
      payload.updateGlobal({ slug: 'navigation', data: { items } as never, overrideAccess: true }),
      'items',
    )
  })

  it('requires the relation for the chosen linkType', async () => {
    await expectValidationError(() =>
      payload.updateGlobal({
        slug: 'navigation',
        data: { items: [{ label: 'Toys', linkType: 'category' }] } as never,
        overrideAccess: true,
      }),
      'items.0.category',
    )
  })

  it('caps announcements at 3', async () => {
    const announcement = Array.from({ length: 4 }, (_, i) => ({ text: `Announcement ${i + 1}` }))
    await expectValidationError(() =>
      payload.updateGlobal({ slug: 'homepage', data: { announcement } as never, overrideAccess: true }),
      'announcement',
    )
  })

  it('rejects a 6.0 rating', async () => {
    await expectValidationError(() =>
      payload.updateGlobal({
        slug: 'store-settings',
        data: { social: { ratings: { amazon: 6 } } } as never,
        overrideAccess: true,
      }),
      'social.ratings.amazon',
    )
  })

  it('hides the pickup address from anonymous readers', async () => {
    await payload.updateGlobal({
      slug: 'store-settings',
      data: {
        business: {
          pickupSameAsBusiness: false,
          pickupAddress: { line1: '12 Warehouse Road', city: 'Jaipur' },
        },
      },
      overrideAccess: true,
    })
    const anonymous = await payload.findGlobal({ slug: 'store-settings', overrideAccess: false })
    expect(anonymous.business?.pickupAddress).toBeUndefined()
    expect(anonymous.business?.pickupSameAsBusiness).toBeUndefined()
    expect(anonymous.business?.name).toBe('Reyan Collections')

    const admin = await payload.findGlobal({
      slug: 'store-settings',
      overrideAccess: false,
      user: adminUser,
    })
    expect(admin.business?.pickupAddress?.line1).toBe('12 Warehouse Road')
  })

  it('never serves homepage drafts to anonymous readers', async () => {
    await payload.updateGlobal({
      slug: 'homepage',
      data: { hero: { headline: 'Published A' }, _status: 'published' } as never,
      overrideAccess: true,
    })
    await payload.updateGlobal({
      slug: 'homepage',
      data: { hero: { headline: 'Draft B' } } as never,
      draft: true,
      overrideAccess: true,
    })

    const anonymous = await payload.findGlobal({ slug: 'homepage', draft: true, overrideAccess: false })
    expect(anonymous.hero?.headline).toBe('Published A')

    const admin = await payload.findGlobal({
      slug: 'homepage',
      draft: true,
      overrideAccess: false,
      user: adminUser,
    })
    expect(admin.hero?.headline).toBe('Draft B')
  })
})
