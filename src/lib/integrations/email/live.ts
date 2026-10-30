import type { EmailClient } from './types'

const API = 'https://api.resend.com/emails'

export interface EmailLiveConfig {
  apiKey: string
  from: string
}

/** Resend HTTP API via fetch. Unverified until go-live (plan 5). */
export function createLiveEmail({ apiKey, from }: EmailLiveConfig): EmailClient {
  return {
    async send({ to, subject, html }) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`Resend send failed with status ${res.status}`)
    },
  }
}
