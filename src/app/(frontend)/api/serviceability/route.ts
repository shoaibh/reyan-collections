import { getShiprocket } from '@/lib/integrations/shiprocket'
import { getClient } from '@/lib/data/getPayloadClient'
import { getPickupPincode } from '@/lib/data/pickup'
import { hitRateLimit } from '@/lib/commerce/rateLimit'
import { clientIp, hashIp } from '@/lib/request'

const headers = { 'Cache-Control': 'no-store' }
const PINCODE = /^[0-9]{6}$/

const bad = (error: string) => Response.json({ error }, { status: 400, headers })

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const pincode = params.get('pincode') ?? ''
  const weightRaw = params.get('weight') ?? ''
  if (!PINCODE.test(pincode)) return bad('Enter a valid 6-digit pincode')
  if (!/^[0-9]{1,6}$/.test(weightRaw) || Number(weightRaw) <= 0) return bad('Invalid weight')

  const payload = await getClient()
  const allowed = await hitRateLimit(payload, `serviceability:${hashIp(clientIp(request))}`, {
    limit: 120,
    windowMs: 3_600_000,
  })
  if (!allowed) return Response.json({ error: 'Too many attempts. Please try again in an hour.' }, { status: 429, headers })

  try {
    const result = await getShiprocket().checkServiceability({
      pickupPincode: await getPickupPincode(payload),
      deliveryPincode: pincode,
      weightGrams: Number(weightRaw),
      cod: true,
    })
    return Response.json(result, { headers })
  } catch (err) {
    payload.logger.error({ err, pincode }, 'Serviceability check failed')
    return Response.json({ error: "We couldn't check delivery right now. Please try again." }, { status: 503, headers })
  }
}
