import type { Payload } from 'payload'

import { integrationMode } from '../mode'
import { createLiveEmail } from './live'
import { createMockEmail } from './mock'
import type { EmailClient } from './types'

export type { EmailClient, EmailMessage } from './types'

export function getEmail(payload: Payload): EmailClient {
  if (integrationMode('EMAIL') !== 'live') return createMockEmail(payload)
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) throw new Error('Email live mode needs RESEND_API_KEY and EMAIL_FROM')
  return createLiveEmail({ apiKey, from })
}
