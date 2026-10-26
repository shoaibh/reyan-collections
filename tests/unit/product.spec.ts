import { describe, it, expect } from 'vitest'
import { showComparison, isComparisonStale } from '@/lib/commerce/product'

describe('showComparison', () => {
  it('is true when compareAt is higher', () => {
    expect(showComparison({ price: 449, compareAt: { price: 549 } })).toBe(true)
  })
  it('is false when equal', () => {
    expect(showComparison({ price: 449, compareAt: { price: 449 } })).toBe(false)
  })
  it('is false when compareAt is null', () => {
    expect(showComparison({ price: 449, compareAt: null })).toBe(false)
  })
})

describe('isComparisonStale', () => {
  it('is true after 30 days', () => {
    expect(isComparisonStale('2026-09-01', new Date('2026-10-26'))).toBe(true)
  })
  it('is false within 30 days', () => {
    expect(isComparisonStale('2026-10-10', new Date('2026-10-26'))).toBe(false)
  })
})
