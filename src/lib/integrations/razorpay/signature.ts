import { createHmac, timingSafeEqual } from 'node:crypto'

export function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/** Constant-time comparison of two hex strings. False (never a throw) on length mismatch. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
