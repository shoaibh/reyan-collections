import { formatINR } from '@/lib/format'

export type PaymentMethod = 'prepaid' | 'cod'

export type PricedLine = {
  productId: number
  variantId: string
  title: string
  variantName: string
  slug: string
  unitPrice: number
  qty: number
  stock: number
  codAllowed: boolean
  hsnCode: string
  gstRate: number
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export type CommerceSettings = {
  shippingFee: number
  freeShippingAbove: number | null
  prepaidDiscount: number
  codMaxOrderValue: number
  maxPerOrder: number
  pendingPaymentMinutes: number
  codConfirmHours: number
}

export type DiscountCodeRule = {
  code: string
  type: 'percent' | 'flat'
  value: number
  maxDiscount?: number | null
  minOrderValue?: number | null
  validFrom?: string | null
  validUntil?: string | null
  usageLimit?: number | null
  perPhoneLimit?: number | null
  active?: boolean | null
}

export type CodeResult = { ok: true; discount: number } | { ok: false; message: string }

export type Totals = {
  subtotal: number
  codeDiscount: number
  shippingFee: number
  prepaidDiscount: number
  prepaidSaving: number
  total: number
}

export const normalizeCode = (raw: string): string => raw.trim().toUpperCase()

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

const istDay = (instant: Date): string =>
  new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)

export function evaluateCode(
  rule: DiscountCodeRule | null,
  ctx: { subtotal: number; now: Date; totalUses: number; phoneUses: number | null },
): CodeResult {
  const fail = (message: string): CodeResult => ({ ok: false, message })
  if (!rule || rule.active !== true) return fail("This code isn't valid")

  const today = istDay(ctx.now)
  if (rule.validFrom && today < istDay(new Date(rule.validFrom))) {
    return fail("This code isn't active yet")
  }
  if (rule.validUntil && today > istDay(new Date(rule.validUntil))) {
    return fail('This code has expired')
  }
  if (rule.minOrderValue != null && ctx.subtotal < rule.minOrderValue) {
    return fail(`Add ${formatINR(rule.minOrderValue - ctx.subtotal)} more to use this code`)
  }
  if (rule.usageLimit != null && ctx.totalUses >= rule.usageLimit) {
    return fail('This code has been fully used')
  }
  if (rule.perPhoneLimit != null && ctx.phoneUses !== null && ctx.phoneUses >= rule.perPhoneLimit) {
    return fail("You've already used this code")
  }

  let discount =
    rule.type === 'flat' ? rule.value : Math.round((ctx.subtotal * rule.value) / 100)
  if (rule.type === 'percent' && rule.maxDiscount != null) {
    discount = Math.min(discount, rule.maxDiscount)
  }
  return { ok: true, discount: Math.min(discount, ctx.subtotal) }
}

export function priceCart(input: {
  lines: Pick<PricedLine, 'unitPrice' | 'qty'>[]
  settings: Pick<CommerceSettings, 'shippingFee' | 'freeShippingAbove' | 'prepaidDiscount'>
  paymentMethod: PaymentMethod
  codeDiscount: number
}): Totals {
  const { settings, codeDiscount } = input
  const subtotal = input.lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
  const afterCode = subtotal - codeDiscount
  const shippingFee =
    settings.freeShippingAbove !== null && afterCode >= settings.freeShippingAbove
      ? 0
      : settings.shippingFee
  const prepaidSaving = Math.min(settings.prepaidDiscount, afterCode)
  const prepaidDiscount = input.paymentMethod === 'prepaid' ? prepaidSaving : 0
  return {
    subtotal,
    codeDiscount,
    shippingFee,
    prepaidDiscount,
    prepaidSaving,
    total: afterCode + shippingFee - prepaidDiscount,
  }
}
