import type { Payload } from 'payload'

import { PINCODE_RE, normalizePhone } from '@/lib/india'
import { getPickupPincode } from '@/lib/data/pickup'
import { getShiprocket } from '@/lib/integrations/shiprocket'

import { loadCart, type CartIssue } from './cartLoader'
import type { ItemInput } from './checkoutInput'
import { codEligibility, type CodResult } from './eligibility'
import {
  evaluateCode,
  normalizeCode,
  priceCart,
  type CommerceSettings,
  type DiscountCodeRule,
  type PaymentMethod,
  type PricedLine,
  type Totals,
} from './pricing'
import { loadCommerceSettings } from './settings'

export type QuoteRequest = {
  items: ItemInput[]
  pincode?: string | null
  paymentMethod: PaymentMethod
  discountCode?: string | null
  phone?: string | null
}

export type QuoteLine = {
  productId: number
  variantId: string
  title: string
  variantName: string
  slug: string
  unitPrice: number
  qty: number
  lineTotal: number
}

export type DeliveryInfo = {
  pincode: string
  serviceable: boolean
  codAvailable: boolean
  etaDays: { min: number; max: number } | null
  city: string | null
  state: string | null
  message: string
}

export type Quote = {
  lines: QuoteLine[]
  issues: CartIssue[]
  totals: Totals
  discountCode: string | null
  codeError: string | null
  delivery: DeliveryInfo | null
  cod: CodResult
}

export type CheckoutComputation = {
  quote: Quote
  lines: PricedLine[]
  settings: CommerceSettings
  codeRule: DiscountCodeRule | null
}

async function loadDelivery(
  payload: Payload,
  pincode: string | null | undefined,
  lines: PricedLine[],
): Promise<DeliveryInfo | null> {
  const weightGrams = lines.reduce((sum, l) => sum + l.weightGrams * l.qty, 0)
  if (!pincode || !PINCODE_RE.test(pincode) || weightGrams <= 0) return null
  const result = await getShiprocket().checkServiceability({
    pickupPincode: await getPickupPincode(payload),
    deliveryPincode: pincode,
    weightGrams,
    cod: true,
  })
  const eta = result.etaDays ?? null
  let message = `Sorry, we can't deliver to ${pincode} yet`
  if (result.serviceable && eta) {
    const where = result.city ? `Delivers to ${result.city}` : 'Delivers'
    message = `${where} in ${eta.min}–${eta.max} days${result.codAvailable ? ' · COD available' : ''}`
  }
  return {
    pincode,
    serviceable: result.serviceable,
    codAvailable: result.codAvailable,
    etaDays: eta,
    city: result.city ?? null,
    state: result.state ?? null,
    message,
  }
}

/**
 * Prices a cart server-side from published data. Read-only. `quote` mode clamps quantities to live
 * stock; `order` mode leaves them as asked, because the reservation step decides.
 */
export async function computeCheckout(
  payload: Payload,
  req: QuoteRequest,
  mode: 'quote' | 'order',
): Promise<CheckoutComputation> {
  const settings = await loadCommerceSettings(payload)
  const loaded = await loadCart(payload, req.items, settings)
  const issues = [...loaded.issues]

  let lines = loaded.lines
  if (mode === 'quote') {
    lines = []
    for (const line of loaded.lines) {
      if (line.stock <= 0) {
        issues.push({ productId: line.productId, variantId: line.variantId, message: 'Out of stock' })
      } else if (line.qty > line.stock) {
        issues.push({ productId: line.productId, variantId: line.variantId, message: `Only ${line.stock} left` })
        lines.push({ ...line, qty: line.stock })
      } else {
        lines.push(line)
      }
    }
  }

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
  const phone = req.phone ? normalizePhone(req.phone) : null

  let codeRule: DiscountCodeRule | null = null
  let codeError: string | null = null
  let discountCode: string | null = null
  let codeDiscount = 0
  const code = req.discountCode ? normalizeCode(req.discountCode) : ''
  if (code) {
    const { docs } = await payload.find({
      collection: 'discount-codes',
      where: { code: { equals: code } },
      limit: 1,
      depth: 0,
    })
    const doc = docs[0]
    codeRule = doc
      ? {
          code: doc.code,
          type: doc.type,
          value: doc.value,
          maxDiscount: doc.maxDiscount,
          minOrderValue: doc.minOrderValue,
          validFrom: doc.validFrom,
          validUntil: doc.validUntil,
          usageLimit: doc.usageLimit,
          perPhoneLimit: doc.perPhoneLimit,
          active: doc.active,
        }
      : null
    const used = { discountCode: { equals: code } }
    const live = { status: { not_equals: 'cancelled' } }
    const totalUses = codeRule
      ? (await payload.count({ collection: 'orders', where: { and: [used, live] } })).totalDocs
      : 0
    const phoneUses =
      codeRule && phone
        ? (
            await payload.count({
              collection: 'orders',
              where: { and: [used, live, { 'customer.phone': { equals: phone } }] },
            })
          ).totalDocs
        : null
    const result = evaluateCode(codeRule, { subtotal, now: new Date(), totalUses, phoneUses })
    if (result.ok) {
      codeDiscount = result.discount
      discountCode = code
    } else {
      codeError = result.message
    }
  }

  const totals = priceCart({ lines, settings, paymentMethod: req.paymentMethod, codeDiscount })
  const delivery = await loadDelivery(payload, req.pincode, lines)

  const blocked = phone
    ? (await payload.count({ collection: 'cod-blocklist', where: { phone: { equals: phone } } })).totalDocs > 0
    : false
  const cod = codEligibility({
    lines,
    total: totals.total,
    codMaxOrderValue: settings.codMaxOrderValue,
    blocked,
    codServiceable: delivery ? delivery.serviceable && delivery.codAvailable : null,
  })

  const quote: Quote = {
    lines: lines.map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      title: l.title,
      variantName: l.variantName,
      slug: l.slug,
      unitPrice: l.unitPrice,
      qty: l.qty,
      lineTotal: l.unitPrice * l.qty,
    })),
    issues,
    totals,
    discountCode,
    codeError,
    delivery,
    cod,
  }
  return { quote, lines, settings, codeRule }
}
