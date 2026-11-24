import { integrationMode } from '../mode'
import { createLiveTurnstile } from './live'
import { mockTurnstile } from './mock'
import type { TurnstileClient } from './types'

export type { TurnstileClient } from './types'

export const MOCK_TURNSTILE_TOKEN = 'mock-pass'

function isLive(): boolean {
  return integrationMode('TURNSTILE') === 'live'
}

function liveEnv(): { siteKey: string; secret: string } {
  const siteKey = process.env.TURNSTILE_SITE_KEY
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!siteKey || !secret) {
    throw new Error('Turnstile live mode needs TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY')
  }
  return { siteKey, secret }
}

export function getTurnstile(): TurnstileClient {
  if (!isLive()) return mockTurnstile
  return createLiveTurnstile(liveEnv().secret)
}

/** Safe to hand to a client form: never includes the secret. */
export function turnstileClientConfig(): { mode: 'mock' | 'live'; siteKey: string | null } {
  if (!isLive()) return { mode: 'mock', siteKey: null }
  return { mode: 'live', siteKey: liveEnv().siteKey }
}
