export type CartLine = { productId: number; variantId: string; qty: number }

const same = (line: CartLine, productId: number, variantId: string) =>
  line.productId === productId && line.variantId === variantId

const clamp = (qty: number, maxPerOrder: number) => Math.max(0, Math.min(Math.floor(qty), maxPerOrder))

export function addLine(lines: CartLine[], line: CartLine, maxPerOrder: number): CartLine[] {
  const existing = lines.find((l) => same(l, line.productId, line.variantId))
  if (!existing) {
    const qty = clamp(line.qty, maxPerOrder)
    return qty > 0 ? [...lines, { ...line, qty }] : lines
  }
  return setQty(lines, line.productId, line.variantId, existing.qty + line.qty, maxPerOrder)
}

export function setQty(
  lines: CartLine[],
  productId: number,
  variantId: string,
  qty: number,
  maxPerOrder: number,
): CartLine[] {
  const next = clamp(qty, maxPerOrder)
  if (next === 0) return removeLine(lines, productId, variantId)
  return lines.map((l) => (same(l, productId, variantId) ? { ...l, qty: next } : l))
}

export function removeLine(lines: CartLine[], productId: number, variantId: string): CartLine[] {
  return lines.filter((l) => !same(l, productId, variantId))
}

export function count(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0)
}

/** Parses persisted cart JSON, returning an empty cart for anything unexpected. */
export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(
      (l): l is CartLine =>
        typeof l === 'object' &&
        l !== null &&
        Number.isInteger((l as CartLine).productId) &&
        typeof (l as CartLine).variantId === 'string' &&
        Number.isInteger((l as CartLine).qty) &&
        (l as CartLine).qty > 0,
    )
  } catch {
    return []
  }
}
