import { createHash } from 'node:crypto'

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
