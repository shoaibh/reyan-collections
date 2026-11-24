import { describe, expect, it } from 'vitest'

import { assertProductionEnv, productionEnvProblems, type Env } from '@/lib/env'

const live: Env = {
  DATABASE_URI: 'postgres://test-user@test-host:5432/test-db',
  PAYLOAD_SECRET: 'x'.repeat(32),
  NEXT_PUBLIC_SERVER_URL: 'https://test.example.com',
  ORIGIN_SECRET: 'y'.repeat(32),
  MEDIA_STORAGE: 'r2',
  R2_BUCKET: 'test-bucket',
  R2_ENDPOINT: 'https://test-account.r2.example.com',
  R2_ACCESS_KEY_ID: 'test-key-id',
  R2_SECRET_ACCESS_KEY: 'test-key-secret',
  R2_PUBLIC_URL: 'https://media.test.example.com',
  RAZORPAY_MODE: 'live',
  RAZORPAY_KEY_ID: 'test-rzp-id',
  RAZORPAY_KEY_SECRET: 'test-rzp-secret',
  RAZORPAY_WEBHOOK_SECRET: 'test-rzp-hook',
  TURNSTILE_MODE: 'live',
  TURNSTILE_SITE_KEY: 'test-ts-site',
  TURNSTILE_SECRET_KEY: 'test-ts-secret',
  SHIPROCKET_MODE: 'live',
  SHIPROCKET_EMAIL: 'test@example.com',
  SHIPROCKET_PASSWORD: 'test-sr-password',
  SHIPROCKET_WEBHOOK_TOKEN: 'test-sr-token',
  EMAIL_MODE: 'live',
  RESEND_API_KEY: 'test-resend',
  EMAIL_FROM: 'Test <test@example.com>',
}

const allMock: Env = {
  DATABASE_URI: live.DATABASE_URI,
  PAYLOAD_SECRET: live.PAYLOAD_SECRET,
  NEXT_PUBLIC_SERVER_URL: live.NEXT_PUBLIC_SERVER_URL,
  ORIGIN_SECRET: live.ORIGIN_SECRET,
  MEDIA_STORAGE: 'local',
  RAZORPAY_MODE: 'mock',
  TURNSTILE_MODE: 'mock',
  SHIPROCKET_MODE: 'mock',
  EMAIL_MODE: 'mock',
}

function without(env: Env, ...keys: string[]): Env {
  const copy = { ...env }
  for (const key of keys) delete copy[key]
  return copy
}

describe('productionEnvProblems', () => {
  it('passes a complete live env', () => {
    expect(productionEnvProblems(live)).toEqual([])
  })

  it('passes all-mock with local media', () => {
    expect(productionEnvProblems(allMock)).toEqual([])
  })

  it.each([
    ['DATABASE_URI missing', without(live, 'DATABASE_URI'), 'DATABASE_URI'],
    ['PAYLOAD_SECRET 31 chars', { ...live, PAYLOAD_SECRET: 'x'.repeat(31) }, 'PAYLOAD_SECRET'],
    ['http site URL', { ...live, NEXT_PUBLIC_SERVER_URL: 'http://test.example.com' }, 'NEXT_PUBLIC_SERVER_URL'],
    ['ORIGIN_SECRET 31 chars', { ...live, ORIGIN_SECRET: 'y'.repeat(31) }, 'ORIGIN_SECRET'],
    ['MEDIA_STORAGE unset', without(live, 'MEDIA_STORAGE'), 'MEDIA_STORAGE'],
    ['MEDIA_STORAGE s3', { ...live, MEDIA_STORAGE: 's3' }, 'MEDIA_STORAGE'],
    ['r2 without R2_BUCKET', without(live, 'R2_BUCKET'), 'R2_BUCKET'],
    ['r2 without R2_ENDPOINT', without(live, 'R2_ENDPOINT'), 'R2_ENDPOINT'],
    ['r2 without R2_ACCESS_KEY_ID', without(live, 'R2_ACCESS_KEY_ID'), 'R2_ACCESS_KEY_ID'],
    ['r2 without R2_SECRET_ACCESS_KEY', without(live, 'R2_SECRET_ACCESS_KEY'), 'R2_SECRET_ACCESS_KEY'],
    ['r2 without R2_PUBLIC_URL', without(live, 'R2_PUBLIC_URL'), 'R2_PUBLIC_URL'],
    ['r2 with http R2_PUBLIC_URL', { ...live, R2_PUBLIC_URL: 'http://media.test.example.com' }, 'R2_PUBLIC_URL'],
    ['RAZORPAY_MODE unset', without(live, 'RAZORPAY_MODE'), 'RAZORPAY_MODE'],
    ['TURNSTILE_MODE invalid', { ...live, TURNSTILE_MODE: 'on' }, 'TURNSTILE_MODE'],
    ['SHIPROCKET_MODE unset', without(live, 'SHIPROCKET_MODE'), 'SHIPROCKET_MODE'],
    ['EMAIL_MODE unset', without(live, 'EMAIL_MODE'), 'EMAIL_MODE'],
    ['live Razorpay without key id', without(live, 'RAZORPAY_KEY_ID'), 'RAZORPAY_KEY_ID'],
    ['live Razorpay without key secret', without(live, 'RAZORPAY_KEY_SECRET'), 'RAZORPAY_KEY_SECRET'],
    ['live Razorpay without webhook secret', without(live, 'RAZORPAY_WEBHOOK_SECRET'), 'RAZORPAY_WEBHOOK_SECRET'],
    ['live Turnstile without site key', without(live, 'TURNSTILE_SITE_KEY'), 'TURNSTILE_SITE_KEY'],
    ['live Turnstile without secret key', without(live, 'TURNSTILE_SECRET_KEY'), 'TURNSTILE_SECRET_KEY'],
    ['live Shiprocket without email', without(live, 'SHIPROCKET_EMAIL'), 'SHIPROCKET_EMAIL'],
    ['live Shiprocket without password', without(live, 'SHIPROCKET_PASSWORD'), 'SHIPROCKET_PASSWORD'],
    ['live Shiprocket without webhook token', without(live, 'SHIPROCKET_WEBHOOK_TOKEN'), 'SHIPROCKET_WEBHOOK_TOKEN'],
    ['live email without Resend key', without(live, 'RESEND_API_KEY'), 'RESEND_API_KEY'],
    ['live email without from address', without(live, 'EMAIL_FROM'), 'EMAIL_FROM'],
  ])('%s gives one problem naming the variable', (_label, env, name) => {
    const problems = productionEnvProblems(env)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(name)
  })

  it('does not require live keys in mock mode', () => {
    expect(productionEnvProblems({ ...allMock, RAZORPAY_MODE: 'mock' })).toEqual([])
  })

  it('reports every problem at once, one per line, without secret values', () => {
    const env = { ...live, PAYLOAD_SECRET: 'short-secret', NEXT_PUBLIC_SERVER_URL: 'http://x', RESEND_API_KEY: '' }
    const problems = productionEnvProblems(env)
    expect(problems).toHaveLength(3)
    expect(problems.join('\n')).not.toContain('short-secret')
  })
})

describe('assertProductionEnv', () => {
  it('does not throw for a complete env', () => {
    expect(() => assertProductionEnv(live)).not.toThrow()
  })

  it('throws one line per problem under a heading', () => {
    const env = without({ ...live, NEXT_PUBLIC_SERVER_URL: 'http://x' }, 'DATABASE_URI')
    expect(() => assertProductionEnv(env)).toThrow(/^Production config is incomplete:\n- .*DATABASE_URI.*\n- .*NEXT_PUBLIC_SERVER_URL/)
  })
})
