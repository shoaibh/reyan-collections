import type { Payload } from 'payload'

import type { CommerceSettings, PricedLine } from './pricing'
import type { ItemInput } from './checkoutInput'

export type CartIssue = { productId: number; variantId: string; message: string }

/**
 * Resolves cart items against published products only. Items must already be merged (parseItems).
 * Unknown products or variants become an issue and no line; qty is clamped to maxPerOrder.
 */
export async function loadCart(
  payload: Payload,
  items: ItemInput[],
  settings: CommerceSettings,
): Promise<{ lines: PricedLine[]; issues: CartIssue[] }> {
  const { docs } = await payload.find({
    collection: 'products',
    where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
    draft: false,
    overrideAccess: false,
    depth: 0,
    pagination: false,
  })
  const byId = new Map(docs.map((d) => [d.id, d]))

  const lines: PricedLine[] = []
  const issues: CartIssue[] = []
  for (const { productId, variantId, qty } of items) {
    const product = byId.get(productId)
    const variant = product?.variants.find((v) => v.id === variantId)
    if (!product || !variant) {
      issues.push({ productId, variantId, message: 'This item is no longer available' })
      continue
    }
    let clamped = qty
    if (qty > settings.maxPerOrder) {
      clamped = settings.maxPerOrder
      issues.push({ productId, variantId, message: `Max ${settings.maxPerOrder} per order` })
    }
    lines.push({
      productId,
      variantId,
      title: product.title,
      variantName: variant.name,
      slug: product.slug ?? '',
      unitPrice: product.price,
      qty: clamped,
      stock: variant.stock,
      codAllowed: product.codAllowed ?? true,
      hsnCode: product.tax.hsnCode,
      gstRate: product.tax.gstRate,
      weightGrams: product.shipping.weightGrams,
      lengthCm: product.shipping.lengthCm,
      widthCm: product.shipping.widthCm,
      heightCm: product.shipping.heightCm,
    })
  }
  return { lines, issues }
}
