import { findOrderUrl } from '@/lib/commerce/customerOrder'
import { hitRateLimit } from '@/lib/commerce/rateLimit'
import { getClient } from '@/lib/data/getPayloadClient'
import { clientIp, hashIp } from '@/lib/request'

const headers = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>
    }
  } catch {
    // handled by the validation below
  }
  const { orderNumber, phone } = body
  if (typeof orderNumber !== 'string' || typeof phone !== 'string' || !orderNumber.trim() || orderNumber.length > 20) {
    return Response.json({ error: 'Enter your order number and mobile number.' }, { status: 400, headers })
  }

  const payload = await getClient()
  const allowed = await hitRateLimit(payload, `track:${hashIp(clientIp(request))}`, {
    limit: 20,
    windowMs: 3_600_000,
  })
  if (!allowed) {
    return Response.json({ error: 'Too many attempts. Please try again in an hour.' }, { status: 429, headers })
  }

  const url = await findOrderUrl(payload, orderNumber, phone)
  if (!url) {
    return Response.json({ error: "We couldn't find an order with that number and phone." }, { status: 404, headers })
  }
  return Response.json({ url }, { headers })
}
