import type { Endpoint, TaskConfig } from 'payload'

import { integrationMode } from '@/lib/integrations/mode'

import { expirePendingPayments, expireUnconfirmedCod } from './expire'
import { pollShipmentStatus } from './pollShipments'

const EVERY_15_MINUTES = [{ cron: '*/15 * * * *', queue: 'default' }]
const HOURLY = [{ cron: '0 * * * *', queue: 'default' }]

export const jobTasks: TaskConfig[] = [
  {
    slug: 'expirePendingPayments',
    schedule: EVERY_15_MINUTES,
    handler: async ({ req }) => {
      const cancelled = await expirePendingPayments(req.payload, new Date())
      return { output: { cancelled: cancelled.length } }
    },
  },
  {
    slug: 'expireUnconfirmedCod',
    schedule: EVERY_15_MINUTES,
    handler: async ({ req }) => {
      const cancelled = await expireUnconfirmedCod(req.payload, new Date())
      return { output: { cancelled: cancelled.length } }
    },
  },
  {
    slug: 'pollShipmentStatus',
    schedule: HOURLY,
    handler: async ({ req }) => {
      const applied = await pollShipmentStatus(req.payload)
      return { output: { applied } }
    },
  },
] as TaskConfig[]

/** Cron runner config. Off when JOBS_AUTORUN=false (tests); Payload itself skips autoRun during `next build`. */
export const jobsAutoRun = () =>
  process.env.JOBS_AUTORUN === 'false' ? [] : [{ cron: '* * * * *', queue: 'default' }]

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * Dev-only: POST /api/dev/run-jobs runs the expiry and polling jobs now. `aheadMinutes` moves the
 * clock forward so a test does not have to wait out a deadline.
 */
export const runJobsNowEndpoint: Endpoint = {
  path: '/dev/run-jobs',
  method: 'post',
  handler: async (req) => {
    if (process.env.NODE_ENV === 'production' || integrationMode('SHIPROCKET') !== 'mock') {
      return Response.json({ error: 'Not found' }, { status: 404, headers: NO_STORE })
    }
    if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })

    const invalid = Response.json(
      { error: 'aheadMinutes must be a whole number of minutes between 0 and 10080' },
      { status: 400, headers: NO_STORE },
    )
    let body: { aheadMinutes?: unknown } | null = null
    try {
      const text = (await req.text?.()) ?? ''
      body = text.trim() === '' ? {} : JSON.parse(text)
    } catch {
      return invalid
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return invalid
    const ahead = body.aheadMinutes === undefined ? 0 : body.aheadMinutes
    if (typeof ahead !== 'number' || !Number.isInteger(ahead) || ahead < 0 || ahead > 10_080) return invalid
    const now = new Date(Date.now() + ahead * 60_000)
    const cancelled = [
      ...(await expirePendingPayments(req.payload, now)),
      ...(await expireUnconfirmedCod(req.payload, now)),
    ]
    const polled = await pollShipmentStatus(req.payload)
    return Response.json({ cancelled, polled }, { headers: NO_STORE })
  },
}
