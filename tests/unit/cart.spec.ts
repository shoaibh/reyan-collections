import { describe, expect, it } from 'vitest'

import { addLine, count, removeLine, setQty, type CartLine } from '@/lib/cart'

const line: CartLine = { productId: 1, variantId: 'mint', qty: 1 }

describe('cart', () => {
  it('merges the same product and variant', () => {
    const lines = addLine(addLine([], line, 5), line, 5)
    expect(lines).toEqual([{ productId: 1, variantId: 'mint', qty: 2 }])
  })

  it('keeps different variants as separate lines', () => {
    const lines = addLine(addLine([], line, 5), { ...line, variantId: 'pink' }, 5)
    expect(lines).toHaveLength(2)
  })

  it('clamps to maxPerOrder', () => {
    const lines = addLine([{ ...line, qty: 4 }], { ...line, qty: 3 }, 5)
    expect(lines[0]?.qty).toBe(5)
    expect(addLine([], { ...line, qty: 9 }, 5)[0]?.qty).toBe(5)
  })

  it('setQty to 0 removes the line, otherwise clamps', () => {
    const start = [line, { ...line, variantId: 'pink' }]
    expect(setQty(start, 1, 'mint', 0, 5)).toEqual([{ ...line, variantId: 'pink' }])
    expect(setQty(start, 1, 'mint', 9, 5)[0]?.qty).toBe(5)
  })

  it('removeLine drops only the matching line', () => {
    const start = [line, { ...line, variantId: 'pink' }]
    expect(removeLine(start, 1, 'pink')).toEqual([line])
  })

  it('count sums quantities', () => {
    expect(count([{ ...line, qty: 2 }, { ...line, variantId: 'pink', qty: 3 }])).toBe(5)
    expect(count([])).toBe(0)
  })
})
