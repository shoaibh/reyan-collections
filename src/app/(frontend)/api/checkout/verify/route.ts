import { verifyPayment } from '@/lib/commerce/payments'
import { getClient } from '@/lib/data/getPayloadClient'

const headers = { 'Cache-Control': 'no-store' }

/** Confirms a Razorpay Checkout result after the browser signature check. Safe to call twice. */
export async function POST(request: Request) {
  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = await request.json()
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>
    }
  } catch {
    // falls through to the failed-signature response
  }
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body
  if (typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') {
    return Response.json({ error: 'Payment could not be verified' }, { status: 400, headers })
  }
  const result = await verifyPayment(await getClient(), { orderId, paymentId, signature })
  return Response.json(result.body, { status: result.status, headers })
}
