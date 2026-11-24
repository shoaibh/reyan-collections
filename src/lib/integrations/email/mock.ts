import type { Payload } from 'payload'

import type { EmailClient } from './types'

/** Dev inbox: stores each email in the dev-emails collection. Logs the recipient and subject, never the body. */
export function createMockEmail(payload: Payload): EmailClient {
  return {
    async send(msg) {
      await payload.create({ collection: 'dev-emails', data: msg })
      payload.logger.info({ to: msg.to, subject: msg.subject }, 'Email (mock)')
    },
  }
}
