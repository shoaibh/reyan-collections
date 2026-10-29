import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as checkoutPost } from '@/app/(frontend)/api/checkout/route'
import { POST as trackPost } from '@/app/(frontend)/api/track/route'
import { findOrderUrl, getOrderForCustomer } from '@/lib/commerce/customerOrder'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'
import { seed, wipe } from '@/seed'

let payload: Payload
let line: { productId: number; variantId: string }

const PHONE = '98765 00021'

const input = (phone: string, paymentMethod: 'cod' | 'prepaid') => ({
  name: 'Asha Verma',
  phone,
  email: '',
  line1: '12 MG Road',
  line2: '',
  landmark: '',
  pincode: '226001',
  city: 'Lucknow',
  state: 'Uttar Pradesh',
  items: [{ ...line, qty: 1 }],
  paymentMethod,
  discountCode: '',
  turnstileToken: MOCK_TURNSTILE_TOKEN,
  honeypot: '',
  idempotencyKey: crypto.randomUUID(),
  expectedTotal: 0,
})

async function place(phone: string, paymentMethod: 'cod' | 'prepaid', ip: string, email = '') {
  const { computeCheckout } = await import('@/lib/commerce/quote')
  const base = { ...input(phone, paymentMethod), email }
  const { quote } = await computeCheckout(
    payload,
    { items: base.items, pincode: '226001', paymentMethod, phone },
    'order',
  )
  const res = await checkoutPost(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip,
        'user-agent': 'vitest',
      },
      body: JSON.stringify({ ...base, expectedTotal: quote.totals.total }),
    }),
  )
  const json = (await res.json()) as { orderNumber: string; token: string }
  if (res.status !== 201) throw new Error(JSON.stringify(json))
  return json
}

describe('customer order view', () => {
  let cod: { orderNumber: string; token: string }
  let prepaid: { orderNumber: string; token: string }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
    const duck = (
      await payload.find({
        collection: 'products',
        where: { title: { contains: 'Duck' } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]!
    line = { productId: duck.id, variantId: duck.variants[0]!.id as string }
    cod = await place(PHONE, 'cod', 'ip-cust-order-1')
    prepaid = await place('98765 00022', 'prepaid', 'ip-cust-order-2', 'asha@example.com')
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('shows the order with the right token, masked phone and no secrets', async () => {
    const view = await getOrderForCustomer(payload, cod.orderNumber, cod.token)
    expect(view).toMatchObject({
      orderNumber: cod.orderNumber,
      heading: 'Order received',
      message: "We'll WhatsApp you shortly to confirm your order.",
      paymentLabel: 'Cash on delivery',
      step: 0,
      shipTo: { name: 'Asha Verma', phone: '••••••0021', place: 'Lucknow, Uttar Pradesh 226001' },
      payment: null,
    })
    const json = JSON.stringify(view)
    expect(json).not.toContain('accessToken')
    expect(json).not.toContain(cod.token)
    expect(json).not.toContain('9876500021')
    expect(json).not.toContain('12 MG Road')
  })

  it('keeps phone, email and the token out of the pending prepaid view except in payment.orderUrl', async () => {
    const view = await getOrderForCustomer(payload, prepaid.orderNumber, prepaid.token)
    expect(view?.payment?.prefill).toEqual({ name: 'Asha Verma' })
    const copy = JSON.parse(JSON.stringify(view)) as { payment: { orderUrl?: string } }
    delete copy.payment.orderUrl
    const json = JSON.stringify(copy)
    expect(json).not.toContain('9876500022')
    expect(json).not.toContain('asha@example.com')
    expect(json).not.toContain(prepaid.token)
  })

  it('labels a COD order Cash on delivery after cash is collected', async () => {
    const o = await place('98765 00023', 'cod', 'ip-cust-order-3')
    const doc = (
      await payload.find({
        collection: 'orders',
        where: { orderNumber: { equals: o.orderNumber } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]!
    await payload.update({
      collection: 'orders',
      id: doc.id,
      data: { paymentStatus: 'cod_collected' },
    })
    expect((await getOrderForCustomer(payload, o.orderNumber, o.token))?.paymentLabel).toBe(
      'Cash on delivery',
    )
  })

  it('keeps the last reached step for a cancelled order and omits a Default variant name', async () => {
    const o = await place('98765 00024', 'cod', 'ip-cust-order-4')
    const doc = (
      await payload.find({
        collection: 'orders',
        where: { orderNumber: { equals: o.orderNumber } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]!
    await payload.update({
      collection: 'orders',
      id: doc.id,
      data: {
        status: 'cancelled',
        items: doc.items!.map((i) => ({ ...i, variantName: 'Default' })),
        timeline: [
          ...(doc.timeline ?? []),
          { status: 'confirmed', at: new Date().toISOString(), by: 'admin' },
          { status: 'cancelled', at: new Date().toISOString(), by: 'admin' },
        ],
      },
    })
    const view = await getOrderForCustomer(payload, o.orderNumber, o.token)
    expect(view?.heading).toBe('Cancelled')
    expect(view?.step).toBe(1)
    expect(view?.items[0]!.label).toBe(doc.items![0]!.title)
  })

  it('builds a WhatsApp link when the store has a number', async () => {
    const view = await getOrderForCustomer(payload, cod.orderNumber, cod.token)
    expect(view?.whatsappUrl).toBe(
      `https://wa.me/910000000000?text=${encodeURIComponent(`Hi, I have a question about my order ${cod.orderNumber}`)}`,
    )
  })

  it('returns null for a wrong token', async () => {
    expect(await getOrderForCustomer(payload, cod.orderNumber, 'wrong-token')).toBeNull()
  })

  it('returns null for a missing token', async () => {
    expect(await getOrderForCustomer(payload, cod.orderNumber, null)).toBeNull()
  })

  it('returns null for an unknown order number', async () => {
    expect(await getOrderForCustomer(payload, 'RC9999', cod.token)).toBeNull()
  })

  it('gives a pending prepaid order a mock payment launch', async () => {
    const view = await getOrderForCustomer(payload, prepaid.orderNumber, prepaid.token)
    expect(view?.heading).toBe('Payment pending')
    expect(view?.paymentLabel).toBe('Payment pending')
    expect(view?.payment?.mode).toBe('mock')
    expect(view?.message).toMatch(
      /^We haven't received your payment yet\. Complete it within \d+ minutes/,
    )
  })

  it('finds the order url by lowercase number and a formatted phone', async () => {
    expect(await findOrderUrl(payload, cod.orderNumber.toLowerCase(), '+91 98765 00021')).toBe(
      `/order/${cod.orderNumber}?t=${cod.token}`,
    )
  })

  it('does not find the order with a wrong phone', async () => {
    expect(await findOrderUrl(payload, cod.orderNumber, '98765 99999')).toBeNull()
  })
})

describe('POST /api/track', () => {
  const req = (ip: string, body: unknown) =>
    trackPost(
      new Request('http://localhost/api/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body),
      }),
    )

  it('answers 400 with no-store for a malformed body', async () => {
    const res = await req('10.99.0.2', { orderNumber: 5 })
    expect(res.status).toBe(400)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 400 for over-long order numbers and phones', async () => {
    expect(
      (await req('10.99.0.3', { orderNumber: 'R'.repeat(21), phone: '98765 12345' })).status,
    ).toBe(400)
    expect((await req('10.99.0.3', { orderNumber: 'RC1001', phone: '9'.repeat(21) })).status).toBe(
      400,
    )
  })

  it('answers 404 for an unknown order', async () => {
    const res = await req('10.99.0.4', { orderNumber: 'RC9999', phone: '98765 12345' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: "We couldn't find an order with that number and phone.",
    })
  })

  it('rate-limits the 21st request from one IP', async () => {
    const ip = '10.99.0.1'
    for (let i = 0; i < 20; i++) await req(ip, { orderNumber: 'RC9999', phone: '98765 12345' })
    const limited = await req(ip, { orderNumber: 'RC9999', phone: '98765 12345' })
    expect(limited.status).toBe(429)
    expect(await limited.json()).toEqual({
      error: 'Too many attempts. Please try again in an hour.',
    })
  })
})
