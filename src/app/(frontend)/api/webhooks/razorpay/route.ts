import { handleRazorpayWebhook } from '@/lib/commerce/payments'
import { getClient } from '@/lib/data/getPayloadClient'

/** Razorpay's server-to-server events. The signature covers the exact raw body, so read it as text. */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const { status } = await handleRazorpayWebhook(
    await getClient(),
    rawBody,
    request.headers.get('x-razorpay-signature'),
  )
  return new Response(null, { status })
}
