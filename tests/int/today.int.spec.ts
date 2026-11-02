import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { POST as checkoutPost } from '@/app/(frontend)/api/checkout/route'
import { drizzleFor } from '@/lib/commerce/db'
import { itemSummary } from '@/lib/commerce/messages'
import { computeCheckout } from '@/lib/commerce/quote'
import { getTodayData } from '@/lib/commerce/today'
import { formatINR } from '@/lib/format'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'
import { seed, wipe } from '@/seed'

type Line = { productId: number; variantId: string }

let payload: Payload
let sand: Line
let initialSandStock = 0

let seq = 0
const nextIp = () => `10.93.${Math.floor(seq / 250)}.${(seq % 250) + 1}`
const nextPhone = () => `98765${String(50000 + seq).padStart(5, '0')}`

async function place(paymentMethod: 'cod' | 'prepaid') {
  seq++
  const phone = nextPhone()
  const items = [{ ...sand, qty: 1 }]
  const { quote } = await computeCheckout(payload, { items, pincode: '226001', paymentMethod, phone }, 'order')
  const res = await checkoutPost(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
      body: JSON.stringify({
        name: 'Asha Verma',
        phone,
        email: '',
        line1: '12 MG Road',
        line2: '',
        landmark: '',
        pincode: '226001',
        city: 'Lucknow',
        state: 'Uttar Pradesh',
        items,
        paymentMethod,
        discountCode: '',
        turnstileToken: MOCK_TURNSTILE_TOKEN,
        honeypot: '',
        idempotencyKey: crypto.randomUUID(),
        expectedTotal: quote.totals.total,
      }),
    }),
  )
  expect(res.status).toBe(201)
  return (
    await payload.find({ collection: 'orders', where: { 'customer.phone': { equals: phone } }, limit: 1, depth: 0 })
  ).docs[0]!
}

// Wednesday 4 November 2026, 19:00 IST. The machine's time zone plays no part.
const NOW = new Date('2026-11-04T19:00:00+05:30')
const HOUR = 3_600_000

async function set(id: number, status: string, hoursAgo: number) {
  const db = await drizzleFor(payload)
  const createdAt = new Date(NOW.getTime() - hoursAgo * HOUR).toISOString()
  await db.execute(sql`UPDATE orders SET status = ${status}, created_at = ${createdAt}::timestamptz WHERE id = ${id}`)
}

describe('getTodayData', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await seed(payload)
    const container = (
      await payload.find({
        collection: 'products',
        where: { slug: { equals: 'mexico-premium-container-set-of-2' } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]!
    const variant = container.variants.find((v) => v.name === 'Sand')!
    sand = { productId: container.id, variantId: variant.id as string }
    initialSandStock = variant.stock as number
  })

  afterAll(async () => {
    const db = await drizzleFor(payload)
    await db.execute(sql`UPDATE products_variants SET stock = ${initialSandStock} WHERE id = ${sand.variantId}`)
    await wipe(payload)
  })

  it('builds the Today view from orders, stock and price checks', async () => {
    const db = await drizzleFor(payload)
    // Plenty of stock while the orders are placed; every other variant is out of the low-stock range
    await db.execute(sql`UPDATE products_variants SET stock = 50`)

    const A = await place('cod') // awaiting, 23h old
    const I = await place('cod') // awaiting, 45 minutes old
    const B = await place('prepaid') // confirmed
    const B2 = await place('cod') // confirmed
    const C = await place('prepaid') // booked
    const D = await place('cod') // shipped
    const E = await place('prepaid') // out for delivery
    const F = await place('prepaid') // delivered, with a payment alert
    const G = await place('cod') // cancelled
    const H = await place('prepaid') // delivered on Sunday 23:00 IST, a credit note is needed
    const J = await place('prepaid') // delivered 10 days ago, its alert is handled

    await payload.update({
      collection: 'orders',
      id: F.id,
      data: { alert: { message: 'Payment received after cancel', handled: false } } as never,
    })
    await payload.update({
      collection: 'orders',
      id: H.id,
      data: { creditNote: { needed: true, handled: false } } as never,
    })
    await payload.update({
      collection: 'orders',
      id: J.id,
      data: { alert: { message: 'Old alert', handled: true }, creditNote: { needed: true, handled: true } } as never,
    })

    await set(A.id, 'awaiting_confirmation', 23)
    await set(I.id, 'awaiting_confirmation', 0.75)
    await set(B.id, 'confirmed', 30)
    await set(B2.id, 'confirmed', 35)
    await set(C.id, 'ready_to_ship', 50)
    await set(D.id, 'shipped', 55)
    await set(E.id, 'out_for_delivery', 56)
    await set(F.id, 'delivered', 60)
    await set(G.id, 'cancelled', 20)
    await set(H.id, 'delivered', 68)
    await set(J.id, 'delivered', 240)

    // Low stock: Sand has 2 left, one other product has 1; a third is stale on its price check
    const others = (
      await payload.find({
        collection: 'products',
        where: { id: { not_equals: sand.productId } },
        limit: 3,
        depth: 0,
        sort: 'id',
      })
    ).docs
    const lowOther = others[0]!
    await db.execute(sql`UPDATE products_variants SET stock = 1 WHERE _parent_id = ${lowOther.id}`)
    await db.execute(sql`UPDATE products_variants SET stock = 2 WHERE id = ${sand.variantId}`)
    await payload.update({
      collection: 'products',
      id: others[1]!.id,
      data: { compareAt: { checkedOn: new Date(NOW.getTime() - 40 * 24 * HOUR).toISOString() } },
    })
    await payload.update({
      collection: 'products',
      id: others[2]!.id,
      data: { compareAt: { checkedOn: new Date(NOW.getTime() - 5 * 24 * HOUR).toISOString() } },
    })

    const doc = (id: number) => payload.findByID({ collection: 'orders', id, depth: 0 })
    const [a, i, b, b2, c, d, e, f, h] = await Promise.all([A, I, B, B2, C, D, E, F, H].map((o) => doc(o.id)))
    const summary = itemSummary(a!.items)
    expect(summary).toContain('(Sand)')

    const today = await getTodayData(payload, NOW, 'Shoaib')

    expect(today.greeting).toBe('Good evening, Shoaib')

    // Oldest first; the one with an hour left shows the countdown, the 45 minute one does not
    expect(today.confirmCod.map((r) => r.id)).toEqual([A.id, I.id])
    expect(today.confirmCod[0]).toMatchObject({
      title: `#${a!.orderNumber} · Asha V.`,
      meta: `${summary} · ${formatINR(a!.total!)} · 23h ago · auto-cancels in 1h`,
    })
    expect(today.confirmCod[0]!.whatsappUrl).toMatch(/^https:\/\/wa\.me\/91\d{10}\?text=/)
    expect(today.confirmCod[0]!.whatsappUrl).toContain(encodeURIComponent('Reply YES to confirm'))
    expect(today.confirmCod[1]).toMatchObject({
      title: `#${i!.orderNumber} · Asha V.`,
      meta: `${summary} · ${formatINR(i!.total!)} · 45m ago`,
    })

    // B2 (35h) is older than B (30h)
    expect(today.readyToShip).toEqual([
      { id: B2.id, title: `#${b2!.orderNumber} · ${summary}`, meta: 'COD confirmed · Lucknow 226001' },
      { id: B.id, title: `#${b!.orderNumber} · ${summary}`, meta: 'Prepaid · Lucknow 226001' },
    ])
    expect(today.bookedCount).toBe(1)

    expect(today.lowStock).toEqual([
      { productId: lowOther.id, title: lowOther.title, meta: '1 left · 0 sold this week' },
      { productId: sand.productId, title: expect.stringMatching(/ \(Sand\)$/), meta: '2 left · 9 sold this week' },
    ])

    expect(today.onTheWay).toEqual({ inTransit: 1, outForDelivery: 1 })

    expect(today.alerts).toEqual([
      {
        kind: 'payment',
        title: `#${f!.orderNumber} · Payment received after cancel`,
        href: `/admin/collections/orders/${F.id}`,
        orderId: F.id,
      },
      {
        kind: 'creditNote',
        title: `#${h!.orderNumber} · Credit note needed (returned after invoicing)`,
        href: `/admin/collections/orders/${H.id}`,
        orderId: H.id,
      },
      {
        kind: 'staleCompare',
        title: `Re-check marketplace price: ${others[1]!.title}`,
        href: `/admin/collections/products/${others[1]!.id}`,
      },
    ])
    expect(today.needsYou).toBe(2 + 2 + 3)

    // Monday 00:00 IST to now: A, I, B, B2, C, D, E, F. Not the cancelled G, not Sunday's H, not J
    const weekDocs = [a!, i!, b!, b2!, c!, d!, e!, f!]
    expect(today.week).toEqual({
      revenue: weekDocs.reduce((sum, o) => sum + (o.total ?? 0), 0),
      orders: 8,
      prepaid: 4,
      cod: 4,
    })

    // The greeting follows the IST hour, and a missing name leaves it bare
    const at = (iso: string) => getTodayData(payload, new Date(iso), null)
    expect((await at('2026-11-04T09:00:00+05:30')).greeting).toBe('Good morning')
    expect((await at('2026-11-04T14:00:00+05:30')).greeting).toBe('Good afternoon')
    expect((await at('2026-11-04T04:00:00Z')).greeting).toBe('Good morning') // 09:30 IST, not 04:00 UTC
  })
})
