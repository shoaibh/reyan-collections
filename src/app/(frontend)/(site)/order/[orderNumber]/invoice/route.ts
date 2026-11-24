import { getOrderForCustomer } from '@/lib/commerce/customerOrder'
import { getClient } from '@/lib/data/getPayloadClient'
import { renderInvoicePdf } from '@/lib/documents/renderInvoice'

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params
  const token = new URL(request.url).searchParams.get('t')
  const payload = await getClient()
  // Same token check as the order page; an order without an invoice number is a plain 404
  const view = await getOrderForCustomer(payload, orderNumber, token)
  if (!view?.invoiceUrl) return notFound()
  const { docs } = await payload.find({
    collection: 'orders',
    where: { orderNumber: { equals: orderNumber } },
    limit: 1,
    depth: 0,
  })
  const rendered = docs[0] ? await renderInvoicePdf(payload, docs[0]) : null
  if (!rendered) return notFound()
  return new Response(new Uint8Array(rendered.pdf), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${rendered.filename}"`,
    },
  })
}
