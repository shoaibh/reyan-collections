import { describe, expect, it } from 'vitest'

import { buildWhatsAppLink } from '@/lib/whatsapp'

describe('buildWhatsAppLink', () => {
  it('prefixes 91 for a 10 digit number and encodes the text', () => {
    expect(buildWhatsAppLink('98765 43210', 'Hi, about Duck toy & more')).toBe(
      'https://wa.me/919876543210?text=Hi%2C%20about%20Duck%20toy%20%26%20more',
    )
  })

  it('strips punctuation and a leading country code', () => {
    expect(buildWhatsAppLink('+91 98765-43210', 'x').startsWith('https://wa.me/919876543210?')).toBe(true)
  })
})
