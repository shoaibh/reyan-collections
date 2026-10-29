import { describe, expect, it } from 'vitest'

import { codEligibility } from '@/lib/commerce/eligibility'

const base = {
  lines: [{ title: 'Mug', codAllowed: true }],
  total: 500,
  codMaxOrderValue: 2000,
  blocked: false,
  codServiceable: true as boolean | null,
}

describe('codEligibility', () => {
  it('is eligible when every rule passes', () => {
    expect(codEligibility(base)).toEqual({ eligible: true })
  })

  it('reports the first item without cod', () => {
    const lines = [
      { title: 'Mug', codAllowed: true },
      { title: 'Vase', codAllowed: false },
      { title: 'Lamp', codAllowed: false },
    ]
    expect(codEligibility({ ...base, lines })).toEqual({
      eligible: false,
      reason: "Cash on delivery isn't available for Vase",
    })
  })

  it('applies the reasons in order', () => {
    const over = { ...base, total: 2001 }
    expect(codEligibility(over)).toEqual({
      eligible: false,
      reason: 'Cash on delivery is available on orders up to ₹2,000',
    })
    const blocked = { ...base, blocked: true, codServiceable: null }
    expect(codEligibility(blocked)).toEqual({
      eligible: false,
      reason: "Cash on delivery isn't available for this order. Please pay online.",
    })
    expect(codEligibility({ ...base, codServiceable: null })).toEqual({
      eligible: false,
      reason: 'Enter your pincode to check cash on delivery',
    })
    expect(codEligibility({ ...base, codServiceable: false })).toEqual({
      eligible: false,
      reason: "Cash on delivery isn't available for this pincode",
    })
  })
})
