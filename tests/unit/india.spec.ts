import { describe, expect, it } from 'vitest'

import { INDIAN_STATES, maskPhone, normalizePhone, PINCODE_RE, stateCodeFor } from '@/lib/india'

describe('india', () => {
  it.each(['9876543210', '+91 98765 43210', '098765-43210', '919876543210'])(
    'normalizes %s',
    (raw) => {
      expect(normalizePhone(raw)).toBe('9876543210')
    },
  )

  it.each(['5876543210', '98765', 'abc'])('rejects %s', (raw) => {
    expect(normalizePhone(raw)).toBeNull()
  })

  it('maps state names to GST codes', () => {
    expect(stateCodeFor('Uttar Pradesh')).toBe('09')
    expect(stateCodeFor('Narnia')).toBeNull()
  })

  it('lists 36 states sorted by name', () => {
    expect(INDIAN_STATES).toHaveLength(36)
    const names = INDIAN_STATES.map((s) => s.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('masks phones', () => {
    expect(maskPhone('9876543210')).toBe('••••••3210')
  })

  it('checks pincode format only', () => {
    expect(PINCODE_RE.test('110001')).toBe(true)
    expect(PINCODE_RE.test('11000')).toBe(false)
  })
})
