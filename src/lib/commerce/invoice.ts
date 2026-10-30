import { amountInWords } from '@/lib/commerce/amountInWords'
import type { Order } from '@/payload-types'

export { amountInWords }

export type InvoiceParty = {
  name: string
  gstin?: string | null
  lines: string[]
  state: string
  stateCode: string | null
}

export type InvoiceLine = {
  description: string
  hsn: string
  qty: number
  unitPrice: number
  grossPaise: number
  discountPaise: number
  taxablePaise: number
  rate: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalPaise: number
}

export type Invoice = {
  number: string
  date: string
  seller: InvoiceParty
  buyer: InvoiceParty
  placeOfSupply: string
  intraState: boolean
  lines: InvoiceLine[]
  shipping: InvoiceLine | null
  codeDiscount: number
  prepaidDiscount: number
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; grandTotal: number }
  amountInWords: string
  warnings: string[]
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const SHIPPING_HSN = '996812'

const pad2 = (n: number): string => String(n % 100).padStart(2, '0')

/** Indian financial year (April to March) of an instant, judged on the IST calendar date. */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS)
  const y = ist.getUTCFullYear()
  return ist.getUTCMonth() >= 3 ? `${y}-${pad2(y + 1)}` : `${y - 1}-${pad2(y)}`
}

export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  const number = `${prefix}/${fy}/${String(seq).padStart(4, '0')}`
  if (number.length > 16) throw new Error('Invoice number exceeds 16 characters')
  return number
}

/** Largest-remainder split of `total` across `weights`; the shares sum exactly to `total`. */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum === 0 || total === 0) return weights.map(() => 0)
  const shares = weights.map((w) => Math.floor((total * w) / sum))
  const remainders = weights.map((w, i) => ({ i, r: (total * w) % sum }))
  remainders.sort((a, b) => b.r - a.r || a.i - b.i)
  let left = total - shares.reduce((s, x) => s + x, 0)
  for (const { i } of remainders) {
    if (left <= 0) break
    shares[i] += 1
    left -= 1
  }
  return shares
}

function makeLine(
  base: { description: string; hsn: string; qty: number; unitPrice: number; rate: number },
  grossPaise: number,
  discountPaise: number,
  intraState: boolean,
): InvoiceLine {
  const net = grossPaise - discountPaise
  const taxablePaise = Math.round((net * 100) / (100 + base.rate))
  const tax = net - taxablePaise
  const cgstPaise = intraState ? Math.floor(tax / 2) : 0
  const sgstPaise = intraState ? tax - cgstPaise : 0
  const igstPaise = intraState ? 0 : tax
  return { ...base, grossPaise, discountPaise, taxablePaise, cgstPaise, sgstPaise, igstPaise, totalPaise: net }
}

export function buildInvoice(
  order: Order,
  seller: InvoiceParty,
  meta: { number: string; issuedAt: string },
): Invoice {
  const warnings: string[] = []
  if (!seller.stateCode) warnings.push('Seller state is not set in Store Settings')
  if (!seller.gstin) warnings.push('GSTIN is not set in Store Settings')

  const addr = order.address ?? {}
  const buyerStateCode = addr.stateCode ?? null
  const buyer: InvoiceParty = {
    name: order.customer?.name ?? '',
    gstin: null,
    lines: [
      addr.line1,
      addr.line2,
      addr.landmark,
      [addr.city, addr.pincode].filter(Boolean).join(' '),
    ].filter((l): l is string => Boolean(l)),
    state: addr.state ?? '',
    stateCode: buyerStateCode,
  }
  const intraState = Boolean(seller.stateCode && buyerStateCode && seller.stateCode === buyerStateCode)

  const items = order.items ?? []
  const grosses = items.map((it) => (it.unitPrice ?? 0) * (it.qty ?? 0) * 100)
  const discountTotal = ((order.codeDiscount ?? 0) + (order.prepaidDiscount ?? 0)) * 100
  const discounts = allocate(discountTotal, grosses)

  const lines = items.map((it, i) => {
    const variant = it.variantName && it.variantName !== 'Default' ? ` (${it.variantName})` : ''
    return makeLine(
      {
        description: `${it.title ?? ''}${variant}`,
        hsn: it.hsnCode ?? '',
        qty: it.qty ?? 0,
        unitPrice: it.unitPrice ?? 0,
        rate: it.gstRate ?? 0,
      },
      grosses[i],
      discounts[i],
      intraState,
    )
  })

  const shippingFee = order.shippingFee ?? 0
  const shipping =
    shippingFee > 0
      ? makeLine(
          {
            description: 'Shipping',
            hsn: SHIPPING_HSN,
            qty: 1,
            unitPrice: shippingFee,
            rate: Math.max(0, ...lines.map((l) => l.rate)),
          },
          shippingFee * 100,
          0,
          intraState,
        )
      : null

  const all = shipping ? [...lines, shipping] : lines
  const sum = (pick: (l: InvoiceLine) => number) => all.reduce((s, l) => s + pick(l), 0)
  const totalPaise = sum((l) => l.totalPaise)
  const grandTotal = totalPaise / 100
  if (grandTotal !== order.total) throw new Error('Invoice total does not match order total')

  return {
    number: meta.number,
    date: meta.issuedAt,
    seller,
    buyer,
    placeOfSupply: buyerStateCode ? `${buyer.state} (${buyerStateCode})` : buyer.state,
    intraState,
    lines,
    shipping,
    codeDiscount: order.codeDiscount ?? 0,
    prepaidDiscount: order.prepaidDiscount ?? 0,
    totals: {
      taxablePaise: sum((l) => l.taxablePaise),
      cgstPaise: sum((l) => l.cgstPaise),
      sgstPaise: sum((l) => l.sgstPaise),
      igstPaise: sum((l) => l.igstPaise),
      grandTotal,
    },
    amountInWords: amountInWords(grandTotal),
    warnings,
  }
}
