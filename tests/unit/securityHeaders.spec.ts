import { describe, expect, it } from 'vitest'

import { storefrontSecurityHeaders } from '@/lib/securityHeaders'

const get = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value ?? ''

describe('storefrontSecurityHeaders', () => {
  const csp = (opts: Parameters<typeof storefrontSecurityHeaders>[0]) =>
    get(storefrontSecurityHeaders(opts), 'Content-Security-Policy')

  it('pins every third-party host and locks down framing', () => {
    const value = csp({ production: true })
    for (const host of [
      'https://checkout.razorpay.com',
      'https://api.razorpay.com',
      'https://lumberjack.razorpay.com',
      'https://challenges.cloudflare.com',
      'https://static.cloudflareinsights.com',
      'https://cloudflareinsights.com',
    ]) {
      expect(value).toContain(host)
    }
    expect(value).toContain("default-src 'self'")
    expect(value).toContain("frame-ancestors 'none'")
    expect(value).toContain("object-src 'none'")
    expect(value).toContain("base-uri 'self'")
    expect(value).toContain("form-action 'self'")
  })

  it("allows 'unsafe-eval' only outside production", () => {
    expect(csp({ production: true })).not.toContain('unsafe-eval')
    expect(csp({ production: false })).toContain("'unsafe-eval'")
  })

  it('puts the media origin in img-src', () => {
    const img = csp({ production: true, mediaOrigin: 'https://media.reyancollection.in' })
      .split('; ')
      .find((d) => d.startsWith('img-src'))
    expect(img).toContain('https://media.reyancollection.in')
    expect(csp({ production: true })).not.toContain('media.reyancollection.in')
  })

  it('sends the other three headers', () => {
    const headers = storefrontSecurityHeaders({ production: true })
    expect(get(headers, 'X-Content-Type-Options')).toBe('nosniff')
    expect(get(headers, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(get(headers, 'Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
  })
})
