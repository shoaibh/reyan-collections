import type { Payload } from 'payload'

/** true = allowed and recorded; false = over the limit (nothing recorded). */
export async function hitRateLimit(
  payload: Payload,
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<boolean> {
  const since = new Date(Date.now() - opts.windowMs).toISOString()
  const { totalDocs } = await payload.count({
    collection: 'rate-limits',
    where: { and: [{ key: { equals: key } }, { createdAt: { greater_than: since } }] },
  })
  if (totalDocs >= opts.limit) return false
  await payload.create({ collection: 'rate-limits', data: { key } })
  await payload.delete({
    collection: 'rate-limits',
    where: { and: [{ key: { equals: key } }, { createdAt: { less_than: since } }] },
  })
  return true
}
