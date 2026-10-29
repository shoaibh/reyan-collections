import { PINCODE_RE, normalizePhone, stateCodeFor } from '@/lib/india'

import { normalizeCode, type PaymentMethod } from './pricing'

export type ItemInput = { productId: number; variantId: string; qty: number }

const MAX_ITEMS = 20
const VARIANT_RE = /^[A-Za-z0-9_-]{1,64}$/

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/** Validates cart items from a request body. Repeated (product, variant) pairs are merged by summing qty. */
export function parseItems(
  value: unknown,
): { ok: true; items: ItemInput[] } | { ok: false; error: string } {
  const invalid = { ok: false, error: 'Invalid cart' } as const
  if (!Array.isArray(value)) return invalid
  if (value.length === 0) return { ok: false, error: 'Your cart is empty' }
  if (value.length > MAX_ITEMS) return invalid

  const merged = new Map<string, ItemInput>()
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return invalid
    const { productId, variantId, qty } = raw as Record<string, unknown>
    if (!isInt(productId, 1, 999_999_999)) return invalid
    if (typeof variantId !== 'string' || !VARIANT_RE.test(variantId)) return invalid
    if (!isInt(qty, 1, 99)) return invalid
    const key = `${productId}:${variantId}`
    const existing = merged.get(key)
    if (existing) existing.qty += qty
    else merged.set(key, { productId, variantId, qty })
  }
  return { ok: true, items: [...merged.values()] }
}

export type CheckoutFields = {
  name: string
  phone: string
  email: string
  line1: string
  line2: string
  landmark: string
  pincode: string
  city: string
  state: string
}
export type CheckoutField = keyof CheckoutFields

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IDEMPOTENCY_RE = /^[A-Za-z0-9-]{16,64}$/
const LONG_TEXT = 'Keep this under 120 characters'

const lengthIn = (v: string, min: number, max: number): boolean => {
  const n = v.trim().length
  return n >= min && n <= max
}

/** Pure field validation shared by the checkout form and the server. Empty object means valid. */
export function fieldErrors(f: CheckoutFields): Partial<Record<CheckoutField, string>> {
  const errors: Partial<Record<CheckoutField, string>> = {}
  if (!lengthIn(f.name, 2, 80)) errors.name = 'Enter your full name'
  if (!normalizePhone(f.phone)) errors.phone = 'Enter a 10-digit mobile number'
  const email = f.email.trim()
  if (email && (email.length > 120 || !EMAIL_RE.test(email))) {
    errors.email = 'Enter a valid email or leave it empty'
  }
  if (!lengthIn(f.line1, 3, 120)) errors.line1 = 'Enter your address'
  if (f.line2.trim().length > 120) errors.line2 = LONG_TEXT
  if (f.landmark.trim().length > 120) errors.landmark = LONG_TEXT
  if (!PINCODE_RE.test(f.pincode.trim())) errors.pincode = 'Enter a valid 6-digit pincode'
  if (!lengthIn(f.city, 2, 60)) errors.city = 'Enter your city'
  if (!stateCodeFor(f.state)) errors.state = 'Choose your state'
  return errors
}

export type CheckoutInput = {
  items: ItemInput[]
  customer: { name: string; phone: string; email: string | null }
  address: {
    line1: string
    line2: string | null
    landmark: string | null
    city: string
    state: string
    stateCode: string
    pincode: string
  }
  paymentMethod: PaymentMethod
  discountCode: string | null
  turnstileToken: string
  honeypot: string
  idempotencyKey: string
  expectedTotal: number
}

const FIELD_ORDER: CheckoutField[] = ['name', 'phone', 'email', 'line1', 'line2', 'landmark', 'pincode', 'city', 'state']

/**
 * Validates and normalises a place-order body. The body is flat: the nine form fields beside
 * `items`, `paymentMethod`, `discountCode`, `turnstileToken`, `honeypot`, `idempotencyKey`, `expectedTotal`.
 */
export function parseCheckoutInput(
  body: unknown,
): { ok: true; value: CheckoutInput } | { ok: false; error: string; field?: CheckoutField | 'items' } {
  const bad = (error: string, field?: CheckoutField | 'items') => ({ ok: false, error, field }) as const
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return bad('Invalid request')
  const b = body as Record<string, unknown>

  const items = parseItems(b.items)
  if (!items.ok) return bad(items.error, 'items')

  const fields = {} as CheckoutFields
  for (const key of FIELD_ORDER) {
    const raw = b[key]
    if (raw === undefined || raw === null) fields[key] = ''
    else if (typeof raw === 'string') fields[key] = raw
    else return bad('Invalid request')
  }
  const errors = fieldErrors(fields)
  for (const key of FIELD_ORDER) {
    if (errors[key]) return bad(errors[key]!, key)
  }

  if (b.paymentMethod !== 'prepaid' && b.paymentMethod !== 'cod') return bad('Invalid payment method')
  if (typeof b.idempotencyKey !== 'string' || !IDEMPOTENCY_RE.test(b.idempotencyKey)) {
    return bad('Invalid request')
  }
  if (!isInt(b.expectedTotal, 0, 100_000_000)) return bad('Invalid request')
  if (typeof b.turnstileToken !== 'string' || b.turnstileToken.length > 2048) return bad('Invalid request')
  const honeypot = b.honeypot ?? ''
  if (typeof honeypot !== 'string') return bad('Invalid request')
  const code = typeof b.discountCode === 'string' ? normalizeCode(b.discountCode) : ''

  return {
    ok: true,
    value: {
      items: items.items,
      customer: {
        name: fields.name.trim(),
        phone: normalizePhone(fields.phone)!,
        email: fields.email.trim() || null,
      },
      address: {
        line1: fields.line1.trim(),
        line2: fields.line2.trim() || null,
        landmark: fields.landmark.trim() || null,
        city: fields.city.trim(),
        state: fields.state,
        stateCode: stateCodeFor(fields.state)!,
        pincode: fields.pincode.trim(),
      },
      paymentMethod: b.paymentMethod,
      discountCode: code || null,
      turnstileToken: b.turnstileToken,
      honeypot,
      idempotencyKey: b.idempotencyKey,
      expectedTotal: b.expectedTotal,
    },
  }
}
