import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import * as emailModule from '@/lib/integrations/email'
import { notify } from '@/lib/notifications/notify'
import { wipe } from '@/seed'
import type { Order } from '@/payload-types'

let payload: Payload

const newOrder = (n: string, email?: string) =>
  payload.create({
    collection: 'orders',
    overrideAccess: true,
    data: {
      orderNumber: n,
      accessToken: `token-${n}`,
      status: 'confirmed',
      paymentMethod: 'cod',
      paymentStatus: 'cod_pending',
      customer: { name: 'Asha', phone: '9000000001', ...(email ? { email } : {}) },
      items: [{ title: 'Kurti', variantName: 'Default', qty: 1, unitPrice: 500 }],
      total: 549,
      meta: { idempotencyKey: `key-${n}` },
    } as never,
  }) as Promise<Order>

const emails = (orderNumber: string) =>
  payload.find({ collection: 'dev-emails', where: { orderNumber: { equals: orderNumber } }, limit: 10 })

const setBusinessEmail = (email: string | null) =>
  payload.updateGlobal({ slug: 'store-settings', data: { business: { email } } as never })

describe('notify', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await wipe(payload)
  })

  afterEach(() => vi.restoreAllMocks())

  afterAll(async () => {
    await setBusinessEmail(null)
    await wipe(payload)
  })

  it('writes one dev-email to the customer, skips when there is no address, and routes the admin email by settings', async () => {
    const withEmail = await newOrder('RC9001', 'asha@example.com')
    await notify(payload, 'order_received', withEmail)
    const sent = await emails('RC9001')
    expect(sent.docs).toHaveLength(1)
    expect(sent.docs[0]).toMatchObject({
      to: 'asha@example.com',
      subject: 'We got your order RC9001',
      orderNumber: 'RC9001',
      tag: 'order_received',
    })

    const noEmail = await newOrder('RC9002')
    await notify(payload, 'order_received', noEmail)
    expect((await emails('RC9002')).docs).toHaveLength(0)

    await setBusinessEmail(null)
    await notify(payload, 'admin_new_order', noEmail)
    expect((await emails('RC9002')).docs).toHaveLength(0)

    await setBusinessEmail('owner@reyan.example')
    await notify(payload, 'admin_new_order', noEmail)
    const admin = await emails('RC9002')
    expect(admin.docs).toHaveLength(1)
    expect(admin.docs[0]).toMatchObject({ to: 'owner@reyan.example', tag: 'admin_new_order' })
    expect(admin.docs[0]!.subject).toBe('New order RC9002 · ₹549 · COD')
  })

  it('never throws: a failing send is logged', async () => {
    const order = await newOrder('RC9003', 'asha@example.com')
    vi.spyOn(emailModule, 'getEmail').mockReturnValue({ send: () => Promise.reject(new Error('boom')) })
    const error = vi.spyOn(payload.logger, 'error')
    await expect(notify(payload, 'order_paid', order)).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})
