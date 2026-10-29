import { parseItems } from '@/lib/commerce/checkoutInput'
import { hitRateLimit } from '@/lib/commerce/rateLimit'
import { computeCheckout } from '@/lib/commerce/quote'
import { getClient } from '@/lib/data/getPayloadClient'
import { clientIp, hashIp } from '@/lib/request'

const headers = { 'Cache-Control': 'no-store' }

const fail = (error: string, status = 400) => Response.json({ error }, { status, headers })

const optionalString = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Live checkout totals, delivery and COD eligibility from published data. Never cached. */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fail('Invalid request')
    body = parsed as Record<string, unknown>
  } catch {
    return fail('Invalid request')
  }

  const items = parseItems(body.items)
  if (!items.ok) return fail(items.error)
  const paymentMethod = body.paymentMethod
  if (paymentMethod !== 'prepaid' && paymentMethod !== 'cod') return fail('Invalid payment method')

  const payload = await getClient()
  const discountCode = optionalString(body.discountCode)
  if (discountCode?.trim()) {
    const allowed = await hitRateLimit(payload, `quote-code:${hashIp(clientIp(request))}`, {
      limit: 30,
      windowMs: 3_600_000,
    })
    if (!allowed) return fail('Too many attempts. Please try again in an hour.', 429)
  }

  const { quote } = await computeCheckout(
    payload,
    {
      items: items.items,
      paymentMethod,
      pincode: optionalString(body.pincode),
      phone: optionalString(body.phone),
      discountCode,
    },
    'quote',
  )
  return Response.json(quote, { headers })
}
