import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

// A missing global also throws, so rejections must be validation errors, not "global not found".
const expectValidationError = async (run: () => Promise<unknown>) => {
  const error = await run().then(
    () => undefined,
    (err: unknown) => err as Error,
  )
  expect(error).toBeInstanceOf(Error)
  expect(error?.message).not.toMatch(/can't be found/)
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
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
    )
  })

  it('requires the relation for the chosen linkType', async () => {
    await expectValidationError(() =>
      payload.updateGlobal({
        slug: 'navigation',
        data: { items: [{ label: 'Toys', linkType: 'category' }] } as never,
        overrideAccess: true,
      }),
    )
  })

  it('caps announcements at 3', async () => {
    const announcement = Array.from({ length: 4 }, (_, i) => ({ text: `Announcement ${i + 1}` }))
    await expectValidationError(() =>
      payload.updateGlobal({ slug: 'homepage', data: { announcement } as never, overrideAccess: true }),
    )
  })

  it('rejects a 6.0 rating', async () => {
    await expectValidationError(() =>
      payload.updateGlobal({
        slug: 'store-settings',
        data: { social: { ratings: { amazon: 6 } } } as never,
        overrideAccess: true,
      }),
    )
  })
})
