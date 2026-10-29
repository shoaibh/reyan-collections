import { placeOrder } from '@/lib/commerce/checkout'
import { parseCheckoutInput } from '@/lib/commerce/checkoutInput'
import { getClient } from '@/lib/data/getPayloadClient'
import { clientIp, hashIp } from '@/lib/request'

const headers = { 'Cache-Control': 'no-store' }

/** Places an order: validates, guards against abuse, re-prices server-side, reserves stock. Never cached. */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request', field: 'body' }, { status: 400, headers })
  }
  const parsed = parseCheckoutInput(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error, field: parsed.field }, { status: 400, headers })
  }
  const payload = await getClient()
  const result = await placeOrder(payload, parsed.value, {
    ipHash: hashIp(clientIp(request)),
    userAgent: request.headers.get('user-agent') ?? '',
  })
  return Response.json(result.body, { status: result.status, headers })
}
