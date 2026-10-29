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
