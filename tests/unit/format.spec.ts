import { describe, expect, it } from 'vitest'

import { formatINR } from '@/lib/format'

describe('formatINR', () => {
  it('formats rupees with Indian grouping and no decimals', () => {
    expect(formatINR(1299)).toBe('₹1,299')
    expect(formatINR(100000)).toBe('₹1,00,000')
    expect(formatINR(0)).toBe('₹0')
  })
})
