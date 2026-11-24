import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clientIp, hashIp, originAllowed } from '@/lib/request'

const req = (headers: Record<string, string> = {}) => new Request('http://x.test/', { headers })

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4')
  })
  it('prefers cf-connecting-ip over x-forwarded-for', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' }))).toBe('9.9.9.9')
  })
  it('falls back to x-real-ip then unknown', () => {
    expect(clientIp(req({ 'x-real-ip': '5.5.5.5' }))).toBe('5.5.5.5')
    expect(clientIp(req())).toBe('unknown')
  })
})

describe('hashIp', () => {
  beforeEach(() => vi.stubEnv('PAYLOAD_SECRET', 'test-secret'))
  afterEach(() => vi.unstubAllEnvs())

  it('is 32 hex chars, stable and does not leak the ip', () => {
    const h = hashIp('1.2.3.4')
    expect(h).toMatch(/^[0-9a-f]{32}$/)
    expect(hashIp('1.2.3.4')).toBe(h)
    expect(h).not.toContain('1.2.3.4')
    expect(hashIp('1.2.3.5')).not.toBe(h)
  })
})

describe('originAllowed', () => {
  const secret = 'x'.repeat(32)
  const prod = { NODE_ENV: 'production', ORIGIN_SECRET: secret }
  const h = (v?: string) => new Headers(v === undefined ? {} : { 'x-origin-secret': v })

  it('allows everything outside production', () => {
    expect(originAllowed('/', h(), { NODE_ENV: 'development', ORIGIN_SECRET: secret })).toBe(true)
  })
  it('lets /api/health through in production without the header', () => {
    expect(originAllowed('/api/health', h(), prod)).toBe(true)
  })
  it('rejects a missing or wrong secret in production', () => {
    expect(originAllowed('/', h(), prod)).toBe(false)
    expect(originAllowed('/', h('y'.repeat(32)), prod)).toBe(false)
    expect(originAllowed('/', h('short'), prod)).toBe(false)
    expect(originAllowed('/', h(secret + 'z'), prod)).toBe(false)
  })
  it('accepts the right secret in production', () => {
    expect(originAllowed('/shop', h(secret), prod)).toBe(true)
  })
  it('rejects everything when the server has no secret', () => {
    expect(originAllowed('/', h(''), { NODE_ENV: 'production' })).toBe(false)
    expect(originAllowed('/', h(), { NODE_ENV: 'production' })).toBe(false)
  })
})
