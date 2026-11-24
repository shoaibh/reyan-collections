import { timingSafeEqual } from 'node:crypto'

import type { Payload } from 'payload'

import { integrationMode } from '@/lib/integrations/mode'
import { MOCK_SHIPROCKET_WEBHOOK_TOKEN } from '@/lib/integrations/shiprocket'

import { applyCourierEvent } from './orderActions'

function secretMatches(given: string | null): boolean {
  const expected =
    integrationMode('SHIPROCKET') === 'live' ? process.env.SHIPROCKET_WEBHOOK_TOKEN : MOCK_SHIPROCKET_WEBHOOK_TOKEN
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

export async function handleShiprocketWebhook(
  payload: Payload,
  body: string,
  token: string | null,
): Promise<{ status: 200 | 401 | 400 }> {
  if (!secretMatches(token)) return { status: 401 }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { status: 400 }
  }
  if (typeof parsed !== 'object' || parsed === null) return { status: 400 }
  const event = parsed as Record<string, unknown>
  const awb = str(event.awb)
  const rawStatus = str(event.current_status)
  if (!awb || !rawStatus) return { status: 400 }
  await applyCourierEvent(payload, {
    awb,
    rawStatus,
    at: str(event.current_timestamp) ?? new Date().toISOString(),
    raw: event,
    source: 'webhook',
  })
  return { status: 200 }
}
