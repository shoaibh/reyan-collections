import type { Order } from '@/payload-types'
import { orderUrl } from '@/lib/commerce/paymentLaunch'
import { formatINR } from '@/lib/format'

export type NotifyEvent =
  | 'order_received'
  | 'order_paid'
  | 'cod_confirmed'
  | 'shipped'
  | 'cancelled'
  | 'refunded'
  | 'admin_new_order'

type Ctx = { siteUrl: string; storeName: string; refundAmount?: number }

const INK = '#1E1B4B'
const TOMATO = '#FF5A36'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const e = escapeHtml

function subjectFor(event: NotifyEvent, order: Order): string {
  const n = order.orderNumber
  switch (event) {
    case 'order_received':
      return `We got your order ${n}`
    case 'order_paid':
    case 'cod_confirmed':
      return `Order ${n} confirmed`
    case 'shipped':
      return `Your order ${n} is on its way`
    case 'cancelled':
      return `Order ${n} cancelled`
    case 'refunded':
      return `Refund for order ${n}`
    case 'admin_new_order':
      return `New order ${n} · ${formatINR(order.total ?? 0)} · ${order.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}`
  }
}

const HEADLINES: Record<NotifyEvent, string> = {
  order_received: 'We got your order',
  order_paid: 'Payment received, order confirmed',
  cod_confirmed: 'Your order is confirmed',
  shipped: 'Your order is on its way',
  cancelled: 'Your order was cancelled',
  refunded: 'Your refund is on its way',
  admin_new_order: 'New order',
}

function itemsHtml(order: Order): string {
  const rows = (order.items ?? [])
    .map((item) => {
      const variant = item.variantName && item.variantName !== 'Default' ? ` — ${item.variantName}` : ''
      return `<li style="margin:0 0 6px">${e(`${item.title ?? ''}${variant}`)} × ${item.qty ?? 0}</li>`
    })
    .join('')
  return `<ul style="margin:12px 0;padding-left:18px">${rows}</ul>`
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${e(href)}" style="display:inline-block;background:${TOMATO};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px">${e(label)}</a></p>`
}

function paragraph(text: string): string {
  return `<p style="margin:12px 0;line-height:1.5">${e(text)}</p>`
}

function bodyFor(event: NotifyEvent, order: Order, ctx: Ctx): string {
  const parts: string[] = []
  const name = order.customer?.name
  if (event === 'admin_new_order') {
    parts.push(paragraph(`Order ${order.orderNumber} from ${name ?? 'a customer'} (${order.customer?.phone ?? 'no phone'}).`))
  } else {
    parts.push(paragraph(`Hi ${name ?? 'there'}, order ${order.orderNumber}.`))
  }
  parts.push(itemsHtml(order))
  parts.push(`<p style="margin:12px 0;font-weight:700">Total: ${e(formatINR(order.total ?? 0))}</p>`)

  if (event === 'order_received') parts.push(paragraph("We'll WhatsApp you shortly to confirm your order."))
  if (event === 'shipped' && order.shipment?.trackingUrl) {
    parts.push(
      `<p style="margin:12px 0">Track your parcel: <a href="${e(order.shipment.trackingUrl)}" style="color:${TOMATO}">${e(order.shipment.trackingUrl)}</a></p>`,
    )
  }
  if ((event === 'cancelled' || event === 'refunded') && ctx.refundAmount !== undefined) {
    parts.push(
      paragraph(
        `Your refund of ${formatINR(ctx.refundAmount)} has been started. It can take 5–7 working days to reach you.`,
      ),
    )
  }

  if (event === 'admin_new_order') {
    parts.push(button(`${ctx.siteUrl}/admin/collections/orders/${order.id}`, 'Open in admin'))
  } else {
    parts.push(button(`${ctx.siteUrl}${orderUrl(order.orderNumber, order.accessToken)}`, 'View your order'))
  }
  return parts.join('')
}

export function renderEmail(event: NotifyEvent, order: Order, ctx: Ctx): { subject: string; html: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5fb;font-family:'Bricolage Grotesque',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}"><div style="max-width:520px;margin:0 auto;padding:24px 16px"><div style="font-weight:800;font-size:18px;color:${INK};margin-bottom:12px">${e(ctx.storeName)}</div><div style="background:#ffffff;border-radius:16px;padding:24px"><h1 style="margin:0 0 8px;font-size:22px;color:${INK}">${e(HEADLINES[event])}</h1>${bodyFor(event, order, ctx)}</div></div></body></html>`
  return { subject: subjectFor(event, order), html }
}
