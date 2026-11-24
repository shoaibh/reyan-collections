import { createHash, timingSafeEqual } from 'node:crypto'

import type { Env } from '@/lib/env'

// cf-connecting-ip is only trustworthy because src/proxy.ts rejects (403) production requests that
// skipped Cloudflare; without that lock anyone hitting the Railway URL could forge it and dodge rate limits.
export function clientIp(request: Request): string {
  const h = request.headers
  return (
    h.get('cf-connecting-ip')?.trim() ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}:${process.env.PAYLOAD_SECRET ?? ''}`).digest('hex').slice(0, 32)
}

/**
 * Production requests must carry the shared secret Cloudflare adds, so traffic that went straight to the
 * Railway URL is refused. /api/health is exempt (Railway calls it directly).
 */
export function originAllowed(pathname: string, headers: Headers, env: Env): boolean {
  if (env.NODE_ENV !== 'production' || pathname === '/api/health') return true
  const expected = env.ORIGIN_SECRET
  const given = headers.get('x-origin-secret')
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
