import { formatINR } from '@/lib/format'
import type { Order } from '@/payload-types'

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]!)

const e = escapeHtml

function slip(order: Order, storeName: string): string {
  const a = order.address
  const address = [a?.line1, a?.line2, a?.landmark, a?.city, [a?.state, a?.pincode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
  const items = (order.items ?? [])
    .map((i) => {
      const variant = i.variantName && i.variantName !== 'Default' ? ` — ${i.variantName}` : ''
      return `<li>☐ ${e(`${i.title ?? ''}${variant}`)} × ${e(i.qty ?? 0)}</li>`
    })
    .join('')
  const awb = order.shipment?.awb
    ? `<p class="awb">AWB ${e(order.shipment.awb)}${order.shipment.courierName ? ` · ${e(order.shipment.courierName)}` : ''}</p>`
    : ''
  const cod =
    order.paymentMethod === 'cod' ? `<p class="cod">COD: collect ${e(formatINR(order.total ?? 0))}</p>` : ''
  return `<section class="slip">
<p class="store">${e(storeName)}</p>
<h1>Order ${e(order.orderNumber)}</h1>
<p class="label">Ship to:</p>
<p><strong>${e(order.customer?.name)}</strong><br>${e(address)}<br>${e(order.customer?.phone)}</p>
${awb}
<ul>${items}</ul>
${cod}
</section>`
}

/** One A6 page per order, ready to print. Every value is escaped. */
export function renderPackingSlips(orders: Order[], storeName: string): string {
  const body = orders.length
    ? orders.map((o) => slip(o, storeName)).join('\n')
    : '<p class="empty">No orders to print.</p>'
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Packing slips</title>
<style>
@page { size: A6; margin: 8mm }
body { font-family: Helvetica, Arial, sans-serif; color: #1E1B4B; margin: 0 }
.slip { page-break-after: always; padding: 8px }
.slip:last-of-type { page-break-after: auto }
.store { margin: 0; font-weight: 700; color: #FF5A36 }
h1 { font-size: 26px; margin: 4px 0 10px }
.label { margin: 0; font-size: 12px; color: #6B6890 }
p { margin: 0 0 6px; font-size: 14px }
ul { list-style: none; padding: 0; margin: 10px 0; font-size: 15px }
li { margin-bottom: 5px }
.awb { font-weight: 700 }
.cod { font-weight: 800; font-size: 16px; border: 2px solid #1E1B4B; padding: 4px 6px }
.print { position: fixed; top: 8px; right: 8px; padding: 8px 14px; font-size: 14px }
.empty { padding: 24px }
@media print { .print { display: none } }
</style></head>
<body>
<button class="print" onclick="window.print()">Print</button>
${body}
</body></html>`
}
