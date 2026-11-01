import { getPayload, Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GET as invoiceGet } from '@/app/(frontend)/(site)/order/[orderNumber]/invoice/route'
import { POST as checkoutPost } from '@/app/(frontend)/api/checkout/route'
import { endpoints } from '@/collections/orders/endpoints'
import { getOrderForCustomer } from '@/lib/commerce/customerOrder'
import { drizzleFor } from '@/lib/commerce/db'
import { confirmOrder, shipOrder } from '@/lib/commerce/orderActions'
import type { OrderPanel } from '@/lib/commerce/orderPanel'
import { computeCheckout } from '@/lib/commerce/quote'
import { codConfirmMessage } from '@/lib/commerce/messages'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'
import { seed, wipe } from '@/seed'

let payload: Payload
let sand: { productId: number; variantId: string }
let initialStock = 0

let seq = 0
const nextIp = () => `10.91.${Math.floor(seq / 250)}.${(seq % 250) + 1}`
const nextPhone = () => `98765${String(70000 + seq).padStart(5, '0')}`

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

const reload = (id: number) => payload.findByID({ collection: 'orders', id, depth: 0 })

type Call = { id?: number; body?: unknown; search?: Record<string, string>; user?: object | null }
function call(method: 'get' | 'post', path: string, opts: Call = {}): Promise<Response> {
  const endpoint = endpoints.find((e) => e.method === method && e.path === path)
  if (!endpoint) throw new Error(`No ${method} ${path} endpoint`)
  const searchParams = new URLSearchParams(opts.search ?? {})
  const req = {
    payload,
    user: opts.user === undefined ? { id: 1, email: 'admin@example.com' } : opts.user,
    routeParams: opts.id === undefined ? {} : { id: String(opts.id) },
    searchParams,
    headers: new Headers(),
    json: async () => opts.body ?? {},
  } as unknown as PayloadRequest
  return Promise.resolve(endpoint.handler(req))
}
const panelOf = async (res: Response) => ((await res.json()) as { panel: OrderPanel }).panel
const getPanel = async (id: number) => {
  const res = await call('get', '/:id/panel', { id })
  expect(res.status).toBe(200)
  return panelOf(res)
}

const customerInvoice = (orderNumber: string, token: string | null) =>
  invoiceGet(new Request(`http://localhost/order/${orderNumber}/invoice${token ? `?t=${token}` : ''}`), {
    params: Promise.resolve({ orderNumber }),
  })

describe('admin order endpoints', () => {
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
    sand = { productId: container.id, variantId: container.variants.find((v) => v.name === 'Sand')!.id as string }
    initialStock = container.variants.find((v) => v.name === 'Sand')!.stock as number
  })

  afterEach(async () => {
    await payload.delete({ collection: 'orders', where: { id: { exists: true } } })
    const db = await drizzleFor(payload)
    await db.execute(sql`UPDATE products_variants SET stock = ${initialStock} WHERE id = ${sand.variantId}`)
  })

  afterAll(async () => {
    await wipe(payload)
  })

  it('refuses a panel request without a user', async () => {
    const order = await place('cod')
    const res = await call('get', '/:id/panel', { id: order.id, user: null })
    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 for a panel of an order that does not exist', async () => {
    const res = await call('get', '/:id/panel', { id: 999999 })
    expect(res.status).toBe(404)
  })

  it('builds the panel for a COD order awaiting confirmation', async () => {
    const order = await place('cod')
    const panel = await getPanel(order.id)
    expect(panel.steps.map((s) => s.state)).toEqual(['done', 'now', 'todo', 'todo'])
    expect(panel.steps.map((s) => s.label)).toEqual(['Placed', 'Confirm', 'Ship', 'Delivered'])
    expect(panel.actions).toEqual(['confirm', 'cancel'])
    expect(panel.whatsapp!.message).toBe(codConfirmMessage(order, 'Reyan Collections'))
    expect(panel.whatsapp!.url.startsWith('https://wa.me/91')).toBe(true)
    expect(panel.customer.phone).toBe(order.customer!.phone)
    expect(panel.eligibility).toEqual({ ok: true, note: '✓ Couriers deliver here · COD allowed · not on blocklist' })
    expect(panel.customerUrl).toContain(`/order/${order.orderNumber}?t=${order.accessToken}`)
    expect(panel.packingSlipUrl).toBe(`/api/orders/packing-slips?ids=${order.id}`)
    expect(panel.invoice).toBeNull()
    expect(panel.shipment).toBeNull()
  })

  it('shows prepaid eligibility and no WhatsApp for an unpaid prepaid order', async () => {
    const order = await place('prepaid')
    const panel = await getPanel(order.id)
    expect(panel.whatsapp).toBeNull()
    expect(panel.eligibility).toEqual({ ok: true, note: '✓ Couriers deliver here' })
    expect(panel.steps.map((s) => s.state)).toEqual(['done', 'now', 'todo', 'todo'])
    expect(panel.autoCancelLabel).toMatch(/^Auto-cancels in \d+ min$/)
  })

  it('flags a COD order whose phone is on the blocklist', async () => {
    const order = await place('cod')
    await payload.create({ collection: 'cod-blocklist', data: { phone: order.customer!.phone as string } })
    const panel = await getPanel(order.id)
    expect(panel.eligibility).toEqual({ ok: false, note: '⚠ on COD blocklist' })
    await payload.delete({ collection: 'cod-blocklist', where: { phone: { equals: order.customer!.phone as string } } })
  })

  it('confirms, then ships with a shipment and an invoice on the panel', async () => {
    const order = await place('cod')
    const confirmed = await call('post', '/:id/confirm', { id: order.id })
    expect(confirmed.status).toBe(200)
    expect((await panelOf(confirmed)).actions).toEqual(['ship', 'cancel'])

    const shipped = await panelOf(await call('post', '/:id/ship', { id: order.id }))
    expect(shipped.status).toBe('ready_to_ship')
    expect(shipped.shipment!.awb).toBeTruthy()
    expect(shipped.invoice!.number).toMatch(/^RC\/\d{4}-\d{2}\/\d{4}$/)
    expect(shipped.invoice!.url).toBe(`/api/orders/${order.id}/invoice.pdf`)
    expect(shipped.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'now'])
  })

  it('returns the action error and status when the action is not allowed', async () => {
    const order = await place('prepaid')
    const res = await call('post', '/:id/confirm', { id: order.id })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "This order can't be confirmed from Payment pending." })
  })

  it('cancels with a note from the request body', async () => {
    const order = await place('cod')
    const panel = await panelOf(await call('post', '/:id/cancel', { id: order.id, body: { note: 'Customer asked' } }))
    expect(panel.status).toBe('cancelled')
    expect(panel.actions).toEqual([])
    expect((await reload(order.id)).timeline!.at(-1)!.note).toContain('Customer asked')
  })

  it('refuses an action without a user', async () => {
    const order = await place('cod')
    const res = await call('post', '/:id/confirm', { id: order.id, user: null })
    expect(res.status).toBe(401)
    expect((await reload(order.id)).status).toBe('awaiting_confirmation')
  })

  it('serves the invoice PDF only after ship', async () => {
    const order = await place('cod')
    await confirmOrder(payload, order.id)
    const early = await call('get', '/:id/invoice.pdf', { id: order.id })
    expect(early.status).toBe(409)
    expect(await early.json()).toEqual({ error: 'Invoice is issued when the order ships' })

    await shipOrder(payload, order.id)
    const shipped = await reload(order.id)
    const res = await call('get', '/:id/invoice.pdf', { id: order.id })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(
      `inline; filename="${shipped.invoice!.number!.replaceAll('/', '-')}.pdf"`,
    )
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('gives the customer the invoice only with the right token', async () => {
    const order = await place('cod')
    await confirmOrder(payload, order.id)
    expect((await customerInvoice(order.orderNumber, order.accessToken)).status).toBe(404)

    await shipOrder(payload, order.id)
    expect((await customerInvoice(order.orderNumber, 'wrong-token')).status).toBe(404)
    expect((await customerInvoice(order.orderNumber, null)).status).toBe(404)
    const res = await customerInvoice(order.orderNumber, order.accessToken)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF')
  })

  it('links the customer order view to the invoice only once it exists', async () => {
    const order = await place('cod')
    await confirmOrder(payload, order.id)
    expect((await getOrderForCustomer(payload, order.orderNumber, order.accessToken))!.invoiceUrl).toBeNull()
    await shipOrder(payload, order.id)
    expect((await getOrderForCustomer(payload, order.orderNumber, order.accessToken))!.invoiceUrl).toBe(
      `/order/${order.orderNumber}/invoice?t=${order.accessToken}`,
    )
  })

  it('prints packing slips for ready-to-ship orders', async () => {
    const order = await place('cod')
    await confirmOrder(payload, order.id)
    await shipOrder(payload, order.id)
    const res = await call('get', '/packing-slips', { search: { status: 'ready_to_ship' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<title>Packing slips</title>')
    expect(html).toContain(order.orderNumber)
    expect(html).toContain('☐')
    expect(html).toContain('COD: collect')
    expect(html).toContain('size: A6')
  })

  it('prints packing slips by ids and escapes values', async () => {
    const order = await place('prepaid')
    await payload.update({ collection: 'orders', id: order.id, depth: 0, data: { customer: { name: '<b>Eve</b>' } } })
    const res = await call('get', '/packing-slips', { search: { ids: String(order.id) } })
    const html = await res.text()
    expect(html).toContain('&lt;b&gt;Eve&lt;/b&gt;')
    expect(html).not.toContain('<b>Eve</b>')
    expect(html).not.toContain('COD: collect')
  })

  it('refuses packing slips without a user', async () => {
    const res = await call('get', '/packing-slips', { search: { ids: '1' }, user: null })
    expect(res.status).toBe(401)
  })

  it('simulates a courier delivery in mock mode', async () => {
    const order = await place('cod')
    await confirmOrder(payload, order.id)
    await shipOrder(payload, order.id)
    const res = await call('post', '/:id/simulate', { id: order.id, body: { status: 'DELIVERED' } })
    expect(res.status).toBe(200)
    const panel = await panelOf(res)
    expect(panel.status).toBe('delivered')
    expect(panel.actions).toEqual(['mark-returned'])
    expect(panel.dev.simulate).toBe(true)
  })

  it('rejects a simulated status it does not know', async () => {
    const order = await place('cod')
    await confirmOrder(payload, order.id)
    await shipOrder(payload, order.id)
    const res = await call('post', '/:id/simulate', { id: order.id, body: { status: 'LOST' } })
    expect(res.status).toBe(400)
  })

  it('does not simulate in production', async () => {
    const order = await place('cod')
    const previous = process.env.NODE_ENV
    ;(process.env as Record<string, string>).NODE_ENV = 'production'
    try {
      const res = await call('post', '/:id/simulate', { id: order.id, body: { status: 'DELIVERED' } })
      expect(res.status).toBe(404)
    } finally {
      ;(process.env as Record<string, string>).NODE_ENV = previous!
    }
  })
})
