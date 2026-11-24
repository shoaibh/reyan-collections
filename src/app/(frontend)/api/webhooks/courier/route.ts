import { handleShiprocketWebhook } from '@/lib/commerce/shipping'
import { getClient } from '@/lib/data/getPayloadClient'

/** Shiprocket's tracking events, authenticated by the shared secret in the x-api-key header. */
export async function POST(request: Request) {
  const body = await request.text()
  const { status } = await handleShiprocketWebhook(await getClient(), body, request.headers.get('x-api-key'))
  return new Response(null, { status })
}
