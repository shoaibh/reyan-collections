import type { TurnstileClient } from './types'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Cloudflare Turnstile siteverify. Unverified until go-live (plan 5). Any error counts as a failed check. */
export function createLiveTurnstile(secret: string): TurnstileClient {
  return {
    async verify(token: string, ip?: string): Promise<boolean> {
      try {
        const body = new URLSearchParams({ secret, response: token })
        if (ip) body.set('remoteip', ip)
        const res = await fetch(SITEVERIFY_URL, {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return false
        const json = (await res.json()) as { success?: boolean }
        return json.success === true
      } catch {
        return false
      }
    },
  }
}
