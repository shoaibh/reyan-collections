import { describe, expect, it } from 'vitest'

import {
  fieldErrors,
  parseCheckoutInput,
  parseItems,
  type CheckoutFields,
} from '@/lib/commerce/checkoutInput'

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

const validFields: CheckoutFields = {
  name: 'Asha Verma',
  phone: '+91 98765 00001',
  email: '',
  line1: '12 MG Road',
  line2: '',
  landmark: '',
  pincode: '226001',
  city: 'Lucknow',
  state: 'Uttar Pradesh',
}

describe('fieldErrors', () => {
  it('accepts a valid form, including a formatted phone and an empty email', () => {
    expect(fieldErrors(validFields)).toEqual({})
  })

  it('returns the exact message for each bad field', () => {
    const bad: CheckoutFields = {
      name: 'A',
      phone: '12345',
      email: 'nope',
      line1: 'ab',
      line2: 'x'.repeat(121),
      landmark: 'y'.repeat(121),
      pincode: '12345',
      city: 'L',
      state: 'Narnia',
    }
    expect(fieldErrors(bad)).toEqual({
      name: 'Enter your full name',
      phone: 'Enter a 10-digit mobile number',
      email: 'Enter a valid email or leave it empty',
      line1: 'Enter your address',
      line2: 'Keep this under 120 characters',
      landmark: 'Keep this under 120 characters',
      pincode: 'Enter a valid 6-digit pincode',
      city: 'Enter your city',
      state: 'Choose your state',
    })
  })

  it('trims before measuring', () => {
    expect(fieldErrors({ ...validFields, name: ' A ', email: '  ' })).toEqual({ name: 'Enter your full name' })
  })
})

describe('parseCheckoutInput', () => {
  const body = {
    items: [{ productId: 1, variantId: 'a', qty: 1 }],
    ...validFields,
    paymentMethod: 'cod',
    discountCode: ' diwali10 ',
    turnstileToken: 'mock-pass',
    honeypot: '',
    idempotencyKey: '0123456789abcdef-key',
    expectedTotal: 498,
  }

  it('normalises a valid body', () => {
    const res = parseCheckoutInput(body)
    expect(res).toEqual({
      ok: true,
      value: {
        items: [{ productId: 1, variantId: 'a', qty: 1 }],
        customer: { name: 'Asha Verma', phone: '9876500001', email: null },
        address: {
          line1: '12 MG Road',
          line2: null,
          landmark: null,
          city: 'Lucknow',
          state: 'Uttar Pradesh',
          stateCode: '09',
          pincode: '226001',
        },
        paymentMethod: 'cod',
        discountCode: 'DIWALI10',
        turnstileToken: 'mock-pass',
        honeypot: '',
        idempotencyKey: '0123456789abcdef-key',
        expectedTotal: 498,
      },
    })
  })

  it('reports the first bad field', () => {
    expect(parseCheckoutInput({ ...body, phone: '1' })).toEqual({
      ok: false,
      error: 'Enter a 10-digit mobile number',
      field: 'phone',
    })
    expect(parseCheckoutInput({ ...body, items: [] })).toEqual({
      ok: false,
      error: 'Your cart is empty',
      field: 'items',
    })
  })

  it('rejects a bad idempotency key, payment method, total, or non-object body', () => {
    expect(parseCheckoutInput({ ...body, idempotencyKey: 'short' }).ok).toBe(false)
    expect(parseCheckoutInput({ ...body, idempotencyKey: 'has spaces in the key!' }).ok).toBe(false)
    expect(parseCheckoutInput({ ...body, paymentMethod: 'upi' }).ok).toBe(false)
    expect(parseCheckoutInput({ ...body, expectedTotal: -1 }).ok).toBe(false)
    expect(parseCheckoutInput({ ...body, expectedTotal: 1.5 }).ok).toBe(false)
    expect(parseCheckoutInput({ ...body, turnstileToken: 5 }).ok).toBe(false)
    expect(parseCheckoutInput(null).ok).toBe(false)
    expect(parseCheckoutInput([]).ok).toBe(false)
  })
})
