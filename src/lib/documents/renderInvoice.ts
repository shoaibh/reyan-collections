import { renderToBuffer } from '@react-pdf/renderer'
import type { Payload } from 'payload'

import { buildInvoice, type InvoiceParty } from '@/lib/commerce/invoice'
import type { Order } from '@/payload-types'

import { InvoicePdf } from './InvoicePdf'

/** The seller block, read uncached from Store Settings so a fix shows on the next download. */
export async function loadSellerParty(payload: Payload): Promise<InvoiceParty> {
  const business = (await payload.findGlobal({ slug: 'store-settings', depth: 0 })).business
  const a = business?.address
  return {
    name: business?.legalName || business?.name || 'Reyan Collections',
    gstin: business?.gstin || null,
    lines: [a?.line1, a?.line2, [a?.city, a?.pincode].filter(Boolean).join(' ')].filter((l): l is string => Boolean(l)),
    state: a?.state ?? '',
    stateCode: a?.stateCode || null,
  }
}

export const invoiceFilename = (number: string): string => `${number.replaceAll('/', '-')}.pdf`

/**
 * Renders the invoice already issued on the order. Never allocates a number: null before Ship,
 * when the order has none.
 */
export async function renderInvoicePdf(
  payload: Payload,
  order: Order,
): Promise<{ pdf: Buffer; filename: string } | null> {
  const number = order.invoice?.number
  if (!number) return null
  const invoice = buildInvoice(order, await loadSellerParty(payload), {
    number,
    issuedAt: order.invoice?.issuedAt ?? order.createdAt,
  })
  const pdf = await renderToBuffer(InvoicePdf({ invoice }))
  return { pdf, filename: invoiceFilename(number) }
}
