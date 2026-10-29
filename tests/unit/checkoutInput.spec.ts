import { describe, expect, it } from 'vitest'

import { parseItems } from '@/lib/commerce/checkoutInput'

describe('parseItems', () => {
  it('merges duplicate product/variant pairs by summing qty', () => {
    expect(
      parseItems([
        { productId: 1, variantId: 'a', qty: 2 },
        { productId: 1, variantId: 'a', qty: 3 },
      ]),
    ).toEqual({ ok: true, items: [{ productId: 1, variantId: 'a', qty: 5 }] })
  })

  it('rejects an empty or non-array cart', () => {
    expect(parseItems([])).toEqual({ ok: false, error: 'Your cart is empty' })
    expect(parseItems('x')).toEqual({ ok: false, error: 'Invalid cart' })
  })

  it('rejects more than 20 items', () => {
    const items = Array.from({ length: 21 }, (_, i) => ({ productId: i + 1, variantId: 'a', qty: 1 }))
    expect(parseItems(items)).toEqual({ ok: false, error: 'Invalid cart' })
  })

  it('rejects bad qty and variant ids', () => {
    for (const qty of [0, 1.5, 100, '2']) {
      expect(parseItems([{ productId: 1, variantId: 'a', qty }]).ok).toBe(false)
    }
    expect(parseItems([{ productId: 1, variantId: 'a b', qty: 1 }]).ok).toBe(false)
    expect(parseItems([{ productId: 0, variantId: 'a', qty: 1 }]).ok).toBe(false)
  })
})
