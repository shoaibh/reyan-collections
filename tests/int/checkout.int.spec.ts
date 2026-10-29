import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/(frontend)/api/checkout/route'
import { drizzleFor } from '@/lib/commerce/db'
import { computeCheckout } from '@/lib/commerce/quote'
import { mockRazorpay } from '@/lib/integrations/razorpay/mock'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'
import { seed, wipe } from '@/seed'

type Line = { productId: number; variantId: string }

let payload: Payload
let mint: Line
let sand: Line
let karaoke: Line
let duck: Line
let hidden: Line
let initialStock: Record<string, number>

let seq = 0
const nextIp = () => `10.70.${Math.floor(seq / 250)}.${(seq % 250) + 1}`
const nextPhone = () => `98765${String(70000 + seq).padStart(5, '0')}`

const item = (line: Line, qty: number) => ({ ...line, qty })
const form = (phone: string) => ({
  name: 'Asha Verma',
  phone,
  email: '',
  line1: '12 MG Road',
  line2: '',
  landmark: '',
  pincode: '226001',
  city: 'Lucknow',
  state: 'Uttar Pradesh',
})

type Case = {
  items: ReturnType<typeof item>[]
  paymentMethod: 'cod' | 'prepaid'
  discountCode?: string
  expectedTotal?: number
  turnstileToken?: string
  honeypot?: string
  idempotencyKey?: string
  phone?: string
  ip?: string
}

const serverTotal = async (c: Case, phone: string) =>
  (
    await computeCheckout(
      payload,
      {
        items: c.items,
        pincode: '226001',
        paymentMethod: c.paymentMethod,
        discountCode: c.discountCode,
        phone,
      },
      'order',
    )
  ).quote.totals.total

/** Posts a valid order; every case gets its own phone and IP unless it passes them. */
async function place(c: Case) {
  seq++
  const phone = c.phone ?? nextPhone()
  const body = {
    ...form(phone),
    items: c.items,
    paymentMethod: c.paymentMethod,
    discountCode: c.discountCode ?? '',
    turnstileToken: c.turnstileToken ?? MOCK_TURNSTILE_TOKEN,
    honeypot: c.honeypot ?? '',
    idempotencyKey: c.idempotencyKey ?? crypto.randomUUID(),
    expectedTotal: c.expectedTotal ?? (await serverTotal(c, phone)),
  }
  const res = await POST(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': c.ip ?? nextIp(),
        'user-agent': 'vitest-agent',
      },
      body: JSON.stringify(body),
    }),
  )
  return { res, body, json: (await res.json()) as Record<string, unknown> & { orderNumber: string; token: string; payment: unknown; code?: string; field?: string; error?: string } }
}

const orderByKey = async (key: string) =>
  (
    await payload.find({
      collection: 'orders',
      where: { 'meta.idempotencyKey': { equals: key } },
      limit: 5,
      depth: 0,
    })
  ).docs

const stockOf = async (line: Line) => {
  const db = await drizzleFor(payload)
  const r = await db.execute(sql`SELECT stock::int AS stock FROM products_variants WHERE id = ${line.variantId}`)
  return Number(r.rows[0]!.stock)
}

describe('POST /api/checkout', () => {
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
        title: 'Hidden Checkout Item',
        images: container.images as never,
        price: 999,
        category: container.category as never,
        variants: [{ name: 'Default', stock: 9 }],
        tax: { hsnCode: '3924', gstRate: 12 },
        shipping: { weightGrams: 300, lengthCm: 20, widthCm: 15, heightCm: 8 },
      },
    })
    hidden = { productId: draftOnly.id, variantId: draftOnly.variants[0]!.id as string }
    initialStock = {}
    for (const l of [mint, sand, karaoke, duck]) initialStock[l.variantId] = await stockOf(l)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    const db = await drizzleFor(payload)
    for (const [id, stock] of Object.entries(initialStock)) {
      await db.execute(sql`UPDATE products_variants SET stock = ${stock} WHERE id = ${id}`)
    }
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('places a COD order, reserves stock and hides the raw IP', async () => {
    const ip = nextIp()
    const { res, body, json } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', ip })
    expect(res.status).toBe(201)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(json.orderNumber).toMatch(/^RC1\d{3}$/)
    expect(json.payment).toBeNull()
    expect(json.orderUrl).toBe(`/order/${json.orderNumber}?t=${json.token}`)
    const [order] = await orderByKey(body.idempotencyKey)
    expect(order).toMatchObject({
      orderNumber: json.orderNumber,
      accessToken: json.token,
      status: 'awaiting_confirmation',
      paymentMethod: 'cod',
      paymentStatus: 'cod_pending',
      total: body.expectedTotal,
      customer: { name: 'Asha Verma', phone: body.phone },
      address: { stateCode: '09', pincode: '226001' },
      meta: { turnstileVerified: true, userAgent: 'vitest-agent' },
    })
    expect(order!.items).toEqual([expect.objectContaining({ title: expect.stringContaining('Duck'), qty: 1 })])
    expect(order!.timeline).toEqual([
      expect.objectContaining({ status: 'awaiting_confirmation', by: 'system', note: 'Order placed' }),
    ])
    expect(order!.meta!.ipHash).toHaveLength(32)
    expect(order!.meta!.ipHash).not.toBe(ip)
    expect(await stockOf(duck)).toBe(initialStock[duck.variantId]! - 1)
  })

  it('places a prepaid order with a code and a mock Razorpay order', async () => {
    const { res, body, json } = await place({
      items: [item(mint, 2)],
      paymentMethod: 'prepaid',
      discountCode: 'DIWALI10',
      expectedTotal: 808,
    })
    expect(res.status).toBe(201)
    const [order] = await orderByKey(body.idempotencyKey)
    expect(order).toMatchObject({
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      discountCode: 'DIWALI10',
      total: 808,
    })
    expect(order!.razorpay!.orderId).toMatch(/^order_mock_/)
    expect(json.payment).toMatchObject({
      mode: 'mock',
      razorpayOrderId: order!.razorpay!.orderId,
      amountPaise: 80800,
      currency: 'INR',
      orderNumber: order!.orderNumber,
      prefill: { name: 'Asha Verma', contact: body.phone },
    })
    expect(await stockOf(mint)).toBe(initialStock[mint.variantId]! - 2)
  })

  it('rejects a filled honeypot', async () => {
    const { res, json, body } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', honeypot: 'bot' })
    expect(res.status).toBe(400)
    expect(json).toEqual({ error: 'Something went wrong. Please try again.' })
    expect(await orderByKey(body.idempotencyKey)).toEqual([])
  })

  it('rejects a failed security check', async () => {
    const { res, json, body } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', turnstileToken: 'fail' })
    expect(res.status).toBe(400)
    expect(json).toEqual({ error: 'Please complete the security check and try again.', code: 'turnstile' })
    expect(await orderByKey(body.idempotencyKey)).toEqual([])
  })

  it('rejects an invalid form field with its name', async () => {
    seq++
    const res = await POST(
      new Request('http://localhost/api/checkout', {
        method: 'POST',
        headers: { 'x-forwarded-for': nextIp() },
        body: JSON.stringify({ ...form('123'), items: [item(duck, 1)] }),
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Enter a 10-digit mobile number', field: 'phone' })
    const bad = await POST(new Request('http://localhost/api/checkout', { method: 'POST', body: '{nope' }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'Invalid request', field: 'body' })
  })

  it('rate limits the 11th attempt from one IP', async () => {
    const ip = nextIp()
    for (let i = 0; i < 10; i++) {
      const { res } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', expectedTotal: 1, ip })
      expect(res.status).toBe(409)
    }
    const { res, json } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', ip })
    expect(res.status).toBe(429)
    expect(json).toEqual({ error: 'Too many attempts. Please try again in an hour.' })
  })

  it('refuses a 4th order from one phone in a day', async () => {
    const phone = nextPhone()
    for (let i = 0; i < 3; i++) {
      const { res } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', phone })
      expect(res.status).toBe(201)
    }
    const { res, json } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', phone })
    expect(res.status).toBe(429)
    expect(json).toEqual({ error: "You've placed 3 orders today. Please WhatsApp us to order more." })
    expect(await stockOf(duck)).toBe(initialStock[duck.variantId]! - 3)
  })

  it('refuses a stale total and creates no order', async () => {
    const { res, json, body } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', expectedTotal: 1 })
    expect(res.status).toBe(409)
    expect(json.code).toBe('price_changed')
    expect(json.error).toMatch(/^Your total changed to ₹[\d,]+\. Please check and place your order again\.$/)
    expect(await orderByKey(body.idempotencyKey)).toEqual([])
    expect(await stockOf(duck)).toBe(initialStock[duck.variantId])
  })

  it('refuses an unpublished product', async () => {
    const { res, json, body } = await place({
      items: [item(hidden, 1), item(duck, 1)],
      paymentMethod: 'cod',
      expectedTotal: 1,
    })
    expect(res.status).toBe(409)
    expect(json).toEqual({
      error: "Some items in your cart are no longer available. We've updated your cart.",
      code: 'cart_changed',
    })
    expect(await orderByKey(body.idempotencyKey)).toEqual([])
  })

  it('refuses an undeliverable pincode and an invalid code', async () => {
    seq++
    const phone = nextPhone()
    const post = (extra: object) =>
      POST(
        new Request('http://localhost/api/checkout', {
          method: 'POST',
          headers: { 'x-forwarded-for': nextIp() },
          body: JSON.stringify({
            ...form(phone),
            items: [item(mint, 1)],
            paymentMethod: 'prepaid',
            turnstileToken: MOCK_TURNSTILE_TOKEN,
            honeypot: '',
            idempotencyKey: crypto.randomUUID(),
            expectedTotal: 449,
            ...extra,
          }),
        }),
      )
    const far = await post({ pincode: '000000' })
    expect(far.status).toBe(422)
    expect(await far.json()).toEqual({ error: "Sorry, we can't deliver to 000000 yet", field: 'pincode' })
    const code = await post({ discountCode: 'NOPE' })
    expect(code.status).toBe(422)
    expect(await code.json()).toEqual({ error: "This code isn't valid", field: 'discountCode' })
  })

  it('refuses more than is in stock, rolls back, and names the variant', async () => {
    const { res, json, body } = await place({ items: [item(sand, 4), item(mint, 1)], paymentMethod: 'prepaid' })
    expect(res.status).toBe(409)
    expect(json).toEqual({ error: 'Only 3 left of Mexico premium container, set of 2 (Sand)', code: 'stock' })
    expect(await orderByKey(body.idempotencyKey)).toEqual([])
    expect(await stockOf(sand)).toBe(initialStock[sand.variantId])
    expect(await stockOf(mint)).toBe(initialStock[mint.variantId])
  })

  it('refuses COD above the order limit', async () => {
    const { res, json } = await place({ items: [item(karaoke, 2)], paymentMethod: 'cod' })
    expect(res.status).toBe(422)
    expect(json.field).toBe('paymentMethod')
    expect(json.error).toMatch(/^Cash on delivery is available on orders up to/)
  })

  it('refuses COD for a blocklisted phone', async () => {
    const phone = nextPhone()
    await payload.create({ collection: 'cod-blocklist', data: { phone } })
    const { res, json } = await place({ items: [item(duck, 1)], paymentMethod: 'cod', phone })
    expect(res.status).toBe(422)
    expect(json).toEqual({
      error: "Cash on delivery isn't available for this order. Please pay online.",
      field: 'paymentMethod',
    })
  })

  it('cancels the order and restores stock when Razorpay is down', async () => {
    vi.spyOn(mockRazorpay, 'createOrder').mockRejectedValueOnce(new Error('down'))
    const { res, json, body } = await place({ items: [item(mint, 1)], paymentMethod: 'prepaid' })
    expect(res.status).toBe(502)
    expect(json).toEqual({ error: "We couldn't start the payment. Please try again." })
    const [order] = await orderByKey(body.idempotencyKey)
    expect(order!.status).toBe('cancelled')
    expect(order!.timeline!.map((t) => t.note)).toEqual(['Order placed', 'Payment could not be started'])
    expect(order!.timeline!.at(-1)!.by).toBe('system')
    expect(await stockOf(mint)).toBe(initialStock[mint.variantId])
  })

  it('returns the same order for a repeated key, sequentially and concurrently', async () => {
    const key = crypto.randomUUID()
    const phone = nextPhone()
    const first = await place({ items: [item(duck, 1)], paymentMethod: 'cod', idempotencyKey: key, phone })
    const again = await place({ items: [item(duck, 1)], paymentMethod: 'cod', idempotencyKey: key, phone })
    expect(first.res.status).toBe(201)
    expect(again.res.status).toBe(200)
    expect(again.json.orderNumber).toBe(first.json.orderNumber)
    expect(again.json.token).toBe(first.json.token)
    expect(await orderByKey(key)).toHaveLength(1)
    expect(await stockOf(duck)).toBe(initialStock[duck.variantId]! - 1)

    const raceKey = crypto.randomUUID()
    const racePhone = nextPhone()
    const [a, b] = await Promise.all([
      place({ items: [item(duck, 1)], paymentMethod: 'cod', idempotencyKey: raceKey, phone: racePhone }),
      place({ items: [item(duck, 1)], paymentMethod: 'cod', idempotencyKey: raceKey, phone: racePhone }),
    ])
    expect([a.res.status, b.res.status].sort()).toEqual([200, 201])
    expect(a.json.orderNumber).toBe(b.json.orderNumber)
    expect(await orderByKey(raceKey)).toHaveLength(1)
    expect(await stockOf(duck)).toBe(initialStock[duck.variantId]! - 2)
  })
})
