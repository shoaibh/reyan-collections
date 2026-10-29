import { afterEach, describe, expect, it, vi } from 'vitest'

import { integrationMode } from '@/lib/integrations/mode'
import { getRazorpay } from '@/lib/integrations/razorpay'
import { getShiprocket } from '@/lib/integrations/shiprocket'
import { getTurnstile, turnstileClientConfig } from '@/lib/integrations/turnstile'

afterEach(() => vi.unstubAllEnvs())

describe('integrationMode', () => {
  it('returns live for live', () => {
    vi.stubEnv('RAZORPAY_MODE', 'live')
    expect(integrationMode('RAZORPAY')).toBe('live')
  })

  it('returns mock for mock', () => {
    vi.stubEnv('RAZORPAY_MODE', 'mock')
    expect(integrationMode('RAZORPAY')).toBe('mock')
  })

  it('defaults to mock when unset outside production', () => {
    vi.stubEnv('TURNSTILE_MODE', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect(integrationMode('TURNSTILE')).toBe('mock')
  })

  it('throws when unset in production', () => {
    vi.stubEnv('SHIPROCKET_MODE', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => integrationMode('SHIPROCKET')).toThrow('Set SHIPROCKET_MODE to live or mock')
  })

  it('throws on any other value', () => {
    vi.stubEnv('RAZORPAY_MODE', 'banana')
    expect(() => integrationMode('RAZORPAY')).toThrow('RAZORPAY_MODE must be live or mock')
  })
})

describe('adapters fail closed in production', () => {
  it('getRazorpay throws when RAZORPAY_MODE is unset', () => {
    vi.stubEnv('RAZORPAY_MODE', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => getRazorpay()).toThrow('Set RAZORPAY_MODE to live or mock')
  })

  it('getTurnstile and turnstileClientConfig throw when TURNSTILE_MODE is unset', () => {
    vi.stubEnv('TURNSTILE_MODE', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => getTurnstile()).toThrow('Set TURNSTILE_MODE to live or mock')
    expect(() => turnstileClientConfig()).toThrow('Set TURNSTILE_MODE to live or mock')
  })

  it('getShiprocket throws when SHIPROCKET_MODE is unset', () => {
    vi.stubEnv('SHIPROCKET_MODE', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => getShiprocket()).toThrow('Set SHIPROCKET_MODE to live or mock')
  })
})
