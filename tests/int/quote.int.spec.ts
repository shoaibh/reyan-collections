import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST } from '@/app/(frontend)/api/checkout/quote/route'
import { seed, wipe } from '@/seed'

let payload: Payload
let mint: { productId: number; variantId: string }
let sand: { productId: number; variantId: string }
let karaoke: { productId: number; variantId: string }
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

  it('rejects bad input', async () => {
    expect(await (await quote(null, '10.60.0.2', '{nope')).json()).toEqual({ error: 'Invalid request' })
    expect((await quote(null, '10.60.0.2', '{nope')).status).toBe(400)
    const empty = await quote({ items: [], paymentMethod: 'cod' })
    expect(empty.status).toBe(400)
    expect(await empty.json()).toEqual({ error: 'Your cart is empty' })
    const noMethod = await quote({ items: [item(mint, 1)] })
    expect(noMethod.status).toBe(400)
    expect(await noMethod.json()).toEqual({ error: 'Invalid payment method' })
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
