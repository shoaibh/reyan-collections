import { describe, expect, it } from 'vitest'

import { evaluateCode, normalizeCode, priceCart, type DiscountCodeRule } from '@/lib/commerce/pricing'

const settings = { shippingFee: 49, freeShippingAbove: 499, prepaidDiscount: 20 }
const one = [{ unitPrice: 449, qty: 1 }]

describe('priceCart', () => {
  it('charges shipping on cod', () => {
    expect(priceCart({ lines: one, settings, paymentMethod: 'cod', codeDiscount: 0 })).toEqual({
      subtotal: 449,
      codeDiscount: 0,
      shippingFee: 49,
      prepaidDiscount: 0,
      prepaidSaving: 20,
      total: 498,
    })
  })

  it('applies the prepaid discount', () => {
    expect(priceCart({ lines: one, settings, paymentMethod: 'prepaid', codeDiscount: 0 }).total).toBe(478)
  })

  it('gives free shipping after a code when the threshold is met', () => {
    const t = priceCart({
      lines: [{ unitPrice: 449, qty: 2 }],
      settings,
      paymentMethod: 'prepaid',
      codeDiscount: 90,
    })
    expect(t.shippingFee).toBe(0)
    expect(t.total).toBe(788)
  })

  it('always charges shipping when there is no threshold', () => {
    const s = { ...settings, freeShippingAbove: null }
    const lines = [{ unitPrice: 5000, qty: 1 }]
    expect(priceCart({ lines, settings: s, paymentMethod: 'cod', codeDiscount: 0 }).shippingFee).toBe(49)
  })

  it('caps the prepaid discount at the amount after code', () => {
    const t = priceCart({
      lines: one,
      settings: { ...settings, prepaidDiscount: 1000 },
      paymentMethod: 'prepaid',
      codeDiscount: 0,
    })
    expect(t.prepaidDiscount).toBe(449)
    expect(t.total).toBe(49)
  })
})

describe('evaluateCode', () => {
  const now = new Date('2026-11-01T06:00:00Z')
  const rule: DiscountCodeRule = { code: 'X', type: 'flat', value: 50, active: true }
  const ctx = { subtotal: 449, now, totalUses: 0, phoneUses: 0 }
  const fail = (message: string) => ({ ok: false, message })

  it('normalizes codes', () => {
    expect(normalizeCode(' diwali10 ')).toBe('DIWALI10')
  })

  it('rejects a missing or inactive rule', () => {
    expect(evaluateCode(null, ctx)).toEqual(fail("This code isn't valid"))
    expect(evaluateCode({ ...rule, active: false }, ctx)).toEqual(fail("This code isn't valid"))
  })

  it('compares dates by IST calendar day', () => {
    expect(evaluateCode({ ...rule, validUntil: '2026-10-31T18:30:00.000Z' }, ctx).ok).toBe(true)
    expect(evaluateCode({ ...rule, validUntil: '2026-10-30T18:30:00.000Z' }, ctx)).toEqual(
      fail('This code has expired'),
    )
    expect(evaluateCode({ ...rule, validFrom: '2026-11-01T18:30:00.000Z' }, ctx)).toEqual(
      fail("This code isn't active yet"),
    )
  })

  it('checks the minimum order value', () => {
    expect(evaluateCode({ ...rule, minOrderValue: 499 }, ctx)).toEqual(
      fail('Add ₹50 more to use this code'),
    )
  })

  it('checks usage limits', () => {
    expect(evaluateCode({ ...rule, usageLimit: 10 }, { ...ctx, totalUses: 10 })).toEqual(
      fail('This code has been fully used'),
    )
    const limited = { ...rule, perPhoneLimit: 1 }
    expect(evaluateCode(limited, { ...ctx, phoneUses: 1 })).toEqual(
      fail("You've already used this code"),
    )
    expect(evaluateCode(limited, { ...ctx, phoneUses: null }).ok).toBe(true)
  })

  it('computes discounts', () => {
    const pct = { ...rule, type: 'percent' as const, value: 10, maxDiscount: 150 }
    expect(evaluateCode(pct, { ...ctx, subtotal: 898 })).toEqual({ ok: true, discount: 90 })
    expect(evaluateCode(pct, { ...ctx, subtotal: 2000 })).toEqual({ ok: true, discount: 150 })
    expect(evaluateCode({ ...rule, type: 'percent', value: 15 }, { ...ctx, subtotal: 333 })).toEqual({
      ok: true,
      discount: 50,
    })
    expect(evaluateCode({ ...rule, value: 100 }, { ...ctx, subtotal: 60 })).toEqual({
      ok: true,
      discount: 60,
    })
  })
})
