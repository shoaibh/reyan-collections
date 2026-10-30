import { describe, expect, it } from 'vitest'

import { amountInWords } from '@/lib/commerce/amountInWords'

describe('amountInWords', () => {
  it('handles zero and one', () => {
    expect(amountInWords(0)).toBe('Rupees Zero Only')
    expect(amountInWords(1)).toBe('Rupees One Only')
  })

  it('spells hundreds and teens', () => {
    expect(amountInWords(808)).toBe('Rupees Eight Hundred Eight Only')
    expect(amountInWords(19)).toBe('Rupees Nineteen Only')
    expect(amountInWords(90)).toBe('Rupees Ninety Only')
  })

  it('uses Indian grouping', () => {
    expect(amountInWords(125000)).toBe('Rupees One Lakh Twenty Five Thousand Only')
    expect(amountInWords(10000000)).toBe('Rupees One Crore Only')
    expect(amountInWords(12345678)).toBe(
      'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only',
    )
  })

  it('handles round and boundary values', () => {
    expect(amountInWords(100)).toBe('Rupees One Hundred Only')
    expect(amountInWords(101)).toBe('Rupees One Hundred One Only')
    expect(amountInWords(1000)).toBe('Rupees One Thousand Only')
    expect(amountInWords(100000)).toBe('Rupees One Lakh Only')
    expect(amountInWords(99999999)).toBe(
      'Rupees Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Only',
    )
  })
})
