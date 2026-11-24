import type { Endpoint, PayloadRequest, Where } from 'payload'

import {
  cancelOrder,
  confirmOrder,
  handleAlert,
  markDelivered,
  markReturned,
  restockOrder,
  shipOrder,
  type ActionResult,
} from '@/lib/commerce/orderActions'
import { buildOrderPanel, canSimulateCourier } from '@/lib/commerce/orderPanel'
import { ORDER_STATUSES } from '@/lib/commerce/orderStateMachine'
import { handleShiprocketWebhook } from '@/lib/commerce/shipping'
import { renderInvoicePdf } from '@/lib/documents/renderInvoice'
import { renderPackingSlips } from '@/lib/documents/packingSlips'
import { MOCK_SHIPROCKET_WEBHOOK_TOKEN } from '@/lib/integrations/shiprocket'
import type { Order } from '@/payload-types'

const NO_STORE = { 'Cache-Control': 'no-store' }
const SIMULATED = ['PICKED UP', 'OUT FOR DELIVERY', 'DELIVERED', 'RTO INITIATED'] as const
const MAX_SLIPS = 200

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: NO_STORE })
const fail = (status: number, error: string): Response => json({ error }, status)

/** Reads the JSON body; an empty or malformed body counts as `{}`. */
async function bodyOf(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json!()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const orderIdOf = (req: PayloadRequest): number | null => {
  const id = Number(req.routeParams?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Wraps a handler with the admin check and `no-store`, and hands it the numeric order id. */
const admin =
  (handler: (req: PayloadRequest, id: number) => Promise<Response>) =>
  async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) return fail(401, 'Unauthorized')
    const id = orderIdOf(req)
    if (id === null) return fail(404, 'Order not found')
    return handler(req, id)
  }

const panelResponse = async (req: PayloadRequest, id: number): Promise<Response> => {
  const panel = await buildOrderPanel(req.payload, id, new Date())
  return panel ? json({ panel }) : fail(404, 'Order not found')
}

const afterAction = async (req: PayloadRequest, id: number, result: ActionResult): Promise<Response> =>
  result.ok ? panelResponse(req, id) : fail(result.status, result.error)

const action = (
  path: string,
  run: (req: PayloadRequest, id: number, body: Record<string, unknown>) => Promise<ActionResult> | ActionResult,
): Endpoint => ({
  path,
  method: 'post',
  handler: admin(async (req, id) => afterAction(req, id, await run(req, id, await bodyOf(req)))),
})

const findOrders = async (req: PayloadRequest): Promise<Order[]> => {
  const ids = (req.searchParams?.get('ids') ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  const status = req.searchParams?.get('status') ?? ''
  const where: Where | null = ids.length
    ? { id: { in: ids.slice(0, MAX_SLIPS) } }
    : (ORDER_STATUSES as readonly string[]).includes(status)
      ? { status: { equals: status } }
      : null
  if (!where) return []
  const { docs } = await req.payload.find({
    collection: 'orders',
    where,
    sort: 'createdAt',
    limit: MAX_SLIPS,
    pagination: false,
    depth: 0,
  })
  return docs
}

// `/packing-slips` is a single segment, so it can never be taken for `/:id/...`; it stays first anyway.
export const endpoints: Endpoint[] = [
  {
    path: '/packing-slips',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return fail(401, 'Unauthorized')
      const settings = await req.payload.findGlobal({ slug: 'store-settings', depth: 0 })
      const html = renderPackingSlips(await findOrders(req), settings.business?.name || 'Reyan Collections')
      return new Response(html, { headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8' } })
    },
  },
  { path: '/:id/panel', method: 'get', handler: admin(panelResponse) },
  action('/:id/confirm', (req, id) => confirmOrder(req.payload, id)),
  action('/:id/ship', (req, id) => shipOrder(req.payload, id)),
  action('/:id/cancel', (req, id, body) =>
    cancelOrder(req.payload, id, { by: 'admin', note: str(body.note)?.trim() || 'Cancelled by admin' }),
  ),
  action('/:id/mark-delivered', (req, id) => markDelivered(req.payload, id, { by: 'admin' })),
  action('/:id/mark-returned', (req, id, body) =>
    markReturned(req.payload, id, { restock: body.restock === true, refundNote: str(body.refundNote)?.trim() || undefined }),
  ),
  action('/:id/restock', (req, id) => restockOrder(req.payload, id)),
  {
    path: '/:id/handle-alert',
    method: 'post',
    handler: admin(async (req, id) => {
      const kind = (await bodyOf(req)).kind
      if (kind !== 'alert' && kind !== 'creditNote') return fail(400, 'Unknown alert kind')
      return afterAction(req, id, await handleAlert(req.payload, id, kind))
    }),
  },
  {
    path: '/:id/simulate',
    method: 'post',
    handler: admin(async (req, id) => {
      if (!canSimulateCourier()) return fail(404, 'Not found')
      const status = (await bodyOf(req)).status
      if (!SIMULATED.includes(status as (typeof SIMULATED)[number])) return fail(400, 'Unknown courier status')
      const order = await req.payload.findByID({ collection: 'orders', id, depth: 0, disableErrors: true })
      if (!order) return fail(404, 'Order not found')
      const awb = order.shipment?.awb
      if (!awb) return fail(409, "This order isn't booked with a courier yet.")
      const body = JSON.stringify({ awb, current_status: status, current_timestamp: new Date().toISOString() })
      const result = await handleShiprocketWebhook(req.payload, body, MOCK_SHIPROCKET_WEBHOOK_TOKEN)
      if (result.status !== 200) return fail(result.status, 'The simulated event was rejected')
      return panelResponse(req, id)
    }),
  },
  {
    path: '/:id/invoice.pdf',
    method: 'get',
    handler: admin(async (req, id) => {
      const order = await req.payload.findByID({ collection: 'orders', id, depth: 0, disableErrors: true })
      if (!order) return fail(404, 'Order not found')
      const rendered = await renderInvoicePdf(req.payload, order)
      if (!rendered) return fail(409, 'Invoice is issued when the order ships')
      return new Response(new Uint8Array(rendered.pdf), {
        headers: {
          ...NO_STORE,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${rendered.filename}"`,
        },
      })
    }),
  },
]
