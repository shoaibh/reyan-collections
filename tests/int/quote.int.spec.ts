import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/(frontend)/api/checkout/quote/route'
import { computeCheckout } from '@/lib/commerce/quote'
import { drizzleFor } from '@/lib/commerce/db'
import { mockShiprocket } from '@/lib/integrations/shiprocket/mock'
import { seed, wipe } from '@/seed'

let payload: Payload
let mint: { productId: number; variantId: string }
let sand: { productId: number; variantId: string }
let karaoke: { productId: number; variantId: string }
let duck: { productId: number; variantId: string }
let hidden: { productId: number; variantId: string }

const quote = (body: unknown, ip = '10.60.0.1', raw?: string) =>
  POST(
    new Request('http://localhost/api/checkout/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: raw ?? JSON.stringify(body),
    }),
  )

const item = (line: { productId: number; variantId: string }, qty: number) => ({ ...line, qty })

describe('POST /api/checkout/quote', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
    const find = async (slug: string) =>
      (await payload.find({ collection: 'products', where: { slug: { equals: slug } }, limit: 1, depth: 0 }))
        .docs[0]!
    const container = await find('mexico-premium-container-set-of-2')
    mint = { productId: container.id, variantId: container.variants.find((v) => v.name === 'Mint')!.id as string }
    sand = { productId: container.id, variantId: container.variants.find((v) => v.name === 'Sand')!.id as string }
    const k = (
      await payload.find({ collection: 'products', where: { title: { contains: 'Karaoke' } }, limit: 1, depth: 0 })
    ).docs[0]!
    karaoke = { productId: k.id, variantId: k.variants[0]!.id as string }
    const d = (
      await payload.find({ collection: 'products', where: { title: { contains: 'Duck' } }, limit: 1, depth: 0 })
    ).docs[0]!
    duck = { productId: d.id, variantId: d.variants[0]!.id as string }
    const draftOnly = await payload.create({
      collection: 'products',
      draft: true,
      data: {
        title: 'Hidden Quote Item',
        images: container.images as never,
        price: 999,
        category: container.category as never,
        variants: [{ name: 'Default', stock: 9 }],
        tax: { hsnCode: '3924', gstRate: 12 },
        shipping: { weightGrams: 300, lengthCm: 20, widthCm: 15, heightCm: 8 },
      },
    })
    hidden = { productId: draftOnly.id, variantId: draftOnly.variants[0]!.id as string }
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('prices a prepaid order with a valid code and delivery info', async () => {
    const res = await quote({
      items: [item(mint, 2)],
      pincode: '226001',
      paymentMethod: 'prepaid',
      discountCode: ' diwali10 ',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.totals).toMatchObject({ subtotal: 898, codeDiscount: 90, shippingFee: 0, total: 808 })
    expect(body.discountCode).toBe('DIWALI10')
    expect(body.codeError).toBeNull()
    expect(body.delivery).toMatchObject({
      serviceable: true,
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      message: 'Delivers to Lucknow in 3–5 days · COD available',
    })
    expect(body.lines[0]).toMatchObject({ qty: 2, unitPrice: 449, lineTotal: 898, variantName: 'Mint' })
  })

  it('explains a code below its minimum order value', async () => {
    const body = await (
      await quote({ items: [item(mint, 1)], paymentMethod: 'cod', discountCode: 'DIWALI10' })
    ).json()
    expect(body.codeError).toBe('Add ₹50 more to use this code')
    expect(body.discountCode).toBeNull()
    expect(body.totals.total).toBe(498)
  })

  it('clamps to live stock', async () => {
    const body = await (await quote({ items: [item(sand, 5)], paymentMethod: 'prepaid' })).json()
    expect(body.issues).toEqual([expect.objectContaining({ variantId: sand.variantId, message: 'Only 3 left' })])
    expect(body.lines[0].qty).toBe(3)
  })

  it('merges repeated lines before clamping', async () => {
    const body = await (
      await quote({ items: [item(sand, 2), item(sand, 2)], paymentMethod: 'prepaid' })
    ).json()
    expect(body.lines).toHaveLength(1)
    expect(body.lines[0].qty).toBe(3)
  })

  it('drops unpublished products and unknown variants', async () => {
    const body = await (
      await quote({
        items: [item(hidden, 1), item({ ...mint, variantId: 'nope' }, 1), item(mint, 1)],
        paymentMethod: 'prepaid',
      })
    ).json()
    expect(body.lines).toHaveLength(1)
    expect(body.issues.map((i: { message: string }) => i.message)).toEqual([
      'This item is no longer available',
      'This item is no longer available',
    ])
    expect(JSON.stringify(body)).not.toContain('Hidden Quote Item')
  })

  it('refuses cod above the order limit', async () => {
    const body = await (
      await quote({ items: [item(karaoke, 2)], pincode: '226001', paymentMethod: 'cod' })
    ).json()
    expect(body.cod).toEqual({
      eligible: false,
      reason: 'Cash on delivery is available on orders up to ₹2,000',
    })
  })

  it('reports unserviceable pincodes', async () => {
    const body = await (
      await quote({ items: [item(mint, 1)], pincode: '000000', paymentMethod: 'prepaid' })
    ).json()
    expect(body.delivery).toMatchObject({ serviceable: false, message: "Sorry, we can't deliver to 000000 yet" })
  })

  it('refuses cod on prepaid-only pincodes', async () => {
    const body = await (
      await quote({ items: [item(mint, 1)], pincode: '111111', paymentMethod: 'cod' })
    ).json()
    expect(body.cod).toEqual({ eligible: false, reason: "Cash on delivery isn't available for this pincode" })
  })

  it('refuses cod for a blocklisted phone', async () => {
    await payload.create({ collection: 'cod-blocklist', data: { phone: '9876500061' } })
    const body = await (
      await quote({
        items: [item(mint, 1)],
        pincode: '226001',
        paymentMethod: 'cod',
        phone: '+91 98765 00061',
      })
    ).json()
    expect(body.cod).toEqual({
      eligible: false,
      reason: "Cash on delivery isn't available for this order. Please pay online.",
    })
  })

  it('rejects malformed JSON', async () => {
    const res = await quote(null, '10.60.0.2', '{nope')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid request' })
  })

  it('rejects an empty cart', async () => {
    const res = await quote({ items: [], paymentMethod: 'cod' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Your cart is empty' })
  })

  it('rejects a missing payment method', async () => {
    const res = await quote({ items: [item(mint, 1)] })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid payment method' })
  })

  it('keeps the asked quantity in order mode', async () => {
    const { quote: q, lines } = await computeCheckout(
      payload,
      { items: [item(sand, 4)], paymentMethod: 'prepaid' },
      'order',
    )
    expect(lines[0]!.qty).toBe(4)
    expect(q.lines[0]!.qty).toBe(4)
    expect(q.issues.filter((i) => i.message.startsWith('Only'))).toEqual([])
  })

  it('clamps to the per-order maximum', async () => {
    const body = await (await quote({ items: [item(duck, 7)], paymentMethod: 'prepaid' })).json()
    expect(body.lines[0].qty).toBe(5)
    expect(body.issues).toEqual([expect.objectContaining({ message: 'Max 5 per order' })])
  })

  it('drops out-of-stock variants in quote mode', async () => {
    const db = await drizzleFor(payload)
    await db.execute(sql`UPDATE products_variants SET stock = 0 WHERE id = ${sand.variantId}`)
    try {
      const body = await (await quote({ items: [item(sand, 1), item(mint, 1)], paymentMethod: 'prepaid' })).json()
      expect(body.lines).toHaveLength(1)
      expect(body.issues).toEqual([
        expect.objectContaining({ variantId: sand.variantId, message: 'Out of stock' }),
      ])
    } finally {
      await db.execute(sql`UPDATE products_variants SET stock = 3 WHERE id = ${sand.variantId}`)
    }
  })

  it('has no delivery when every line is dropped', async () => {
    const body = await (
      await quote({
        items: [item({ ...mint, variantId: 'nope' }, 1)],
        pincode: '226001',
        paymentMethod: 'prepaid',
      })
    ).json()
    expect(body.lines).toEqual([])
    expect(body.delivery).toBeNull()
  })

  describe('code usage', () => {
    const makeCode = (code: string, data: { usageLimit?: number; perPhoneLimit?: number }) =>
      payload.create({
        collection: 'discount-codes',
        data: { code, type: 'flat', value: 10, active: true, ...data },
      })
    const makeOrder = (code: string, status: string, phone: string, n: number) =>
      payload.create({
        collection: 'orders',
        data: {
          orderNumber: `T6-${code}-${n}`,
          accessToken: `tok-${code}-${n}`,
          status: status as 'cancelled',
          discountCode: code,
          customer: { phone },
        },
      })
    const withCode = async (code: string, phone?: string) =>
      (
        await quote({ items: [item(mint, 1)], paymentMethod: 'prepaid', discountCode: code, phone }, '10.60.0.3')
      ).json()

    it('ignores cancelled orders for the usage limit', async () => {
      await makeCode('LIMIT-A', { usageLimit: 1 })
      await makeOrder('LIMIT-A', 'cancelled', '9876500071', 1)
      const body = await withCode('LIMIT-A')
      expect(body.codeError).toBeNull()
      expect(body.discountCode).toBe('LIMIT-A')
    })

    it('counts live orders against the usage limit', async () => {
      await makeCode('LIMIT-B', { usageLimit: 1 })
      await makeOrder('LIMIT-B', 'cancelled', '9876500072', 1)
      await makeOrder('LIMIT-B', 'confirmed', '9876500073', 2)
      expect((await withCode('LIMIT-B')).codeError).toBe('This code has been fully used')
    })

    it('blocks a phone that already used the code', async () => {
      await makeCode('PHONE-A', { perPhoneLimit: 1 })
      await makeOrder('PHONE-A', 'confirmed', '9876500074', 1)
      expect((await withCode('PHONE-A', '+91 98765 00074')).codeError).toBe("You've already used this code")
      expect((await withCode('PHONE-A', '9876500075')).codeError).toBeNull()
    })

    it('does not count cancelled orders for the same phone', async () => {
      await makeCode('PHONE-B', { perPhoneLimit: 1 })
      await makeOrder('PHONE-B', 'cancelled', '9876500076', 1)
      expect((await withCode('PHONE-B', '9876500076')).codeError).toBeNull()
    })

    it('skips the per-phone check without a phone', async () => {
      await makeCode('PHONE-C', { perPhoneLimit: 1 })
      await makeOrder('PHONE-C', 'confirmed', '9876500077', 1)
      expect((await withCode('PHONE-C')).codeError).toBeNull()
    })
  })

  describe('when Shiprocket misbehaves', () => {
    const makeReq = () => ({ items: [item(mint, 1)], pincode: '226001', paymentMethod: 'prepaid' as const })

    it('fails closed in both modes when the check throws', async () => {
      for (const mode of ['quote', 'order'] as const) {
        const spy = vi.spyOn(mockShiprocket, 'checkServiceability').mockRejectedValueOnce(new Error('down'))
        const { quote: q } = await computeCheckout(payload, makeReq(), mode)
        spy.mockRestore()
        expect(q.delivery).toEqual({
          pincode: '226001',
          serviceable: false,
          codAvailable: false,
          etaDays: null,
          city: null,
          state: null,
          message: "We couldn't check delivery right now. Please try again.",
        })
      }
    })

    it('never says sorry for a serviceable pincode without an ETA', async () => {
      const spy = vi
        .spyOn(mockShiprocket, 'checkServiceability')
        .mockResolvedValueOnce({ serviceable: true, codAvailable: false })
      const { quote: q } = await computeCheckout(payload, makeReq(), 'quote')
      expect(q.delivery).toMatchObject({ serviceable: true, message: 'Delivers to 226001' })
      spy.mockResolvedValueOnce({ serviceable: true, codAvailable: true, city: 'Lucknow' })
      const { quote: q2 } = await computeCheckout(payload, makeReq(), 'quote')
      spy.mockRestore()
      expect(q2.delivery!.message).toBe('Delivers to Lucknow · COD available')
    })
  })

  it('rate limits code-bearing quotes per IP', async () => {
    const ip = '10.60.0.99'
    const body = { items: [item(mint, 2)], paymentMethod: 'prepaid', discountCode: 'DIWALI10' }
    for (let i = 0; i < 30; i++) expect((await quote(body, ip)).status).toBe(200)
    const limited = await quote(body, ip)
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({ error: 'Too many attempts. Please try again in an hour.' })
    // Quotes without a code are not limited
    expect((await quote({ items: [item(mint, 1)], paymentMethod: 'prepaid' }, ip)).status).toBe(200)
  })
})
