import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { withTransaction } from './db'

/**
 * true = allowed and recorded; false = over the limit (nothing recorded). Count-then-insert runs
 * under a per-key advisory lock, so parallel requests cannot all slip under the limit.
 */
export async function hitRateLimit(
  payload: Payload,
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<boolean> {
  const since = new Date(Date.now() - opts.windowMs).toISOString()
  return withTransaction(payload, async (tx) => {
    await tx.db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)
    const { totalDocs } = await payload.count({
      collection: 'rate-limits',
      req: tx.req,
      where: { and: [{ key: { equals: key } }, { createdAt: { greater_than: since } }] },
    })
    if (totalDocs >= opts.limit) return false
    await payload.create({ collection: 'rate-limits', req: tx.req, data: { key } })
    await payload.delete({
      collection: 'rate-limits',
      req: tx.req,
      where: { and: [{ key: { equals: key } }, { createdAt: { less_than: since } }] },
    })
    return true
  })
}
