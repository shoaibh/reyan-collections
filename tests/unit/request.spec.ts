import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clientIp, hashIp } from '@/lib/request'

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
