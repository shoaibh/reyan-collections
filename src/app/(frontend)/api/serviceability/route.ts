import { getShiprocket } from '@/lib/integrations/shiprocket'
import { getClient } from '@/lib/data/getPayloadClient'
import { getPickupPincode } from '@/lib/data/pickup'

const headers = { 'Cache-Control': 'no-store' }
const PINCODE = /^[0-9]{6}$/

const bad = (error: string) => Response.json({ error }, { status: 400, headers })

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const pincode = params.get('pincode') ?? ''
  const weightRaw = params.get('weight') ?? ''
  if (!PINCODE.test(pincode)) return bad('Enter a valid 6-digit pincode')
  if (!/^[0-9]{1,6}$/.test(weightRaw) || Number(weightRaw) <= 0) return bad('Invalid weight')

  const pickupPincode = await getPickupPincode(await getClient())

  const result = await getShiprocket().checkServiceability({
    pickupPincode,
    deliveryPincode: pincode,
    weightGrams: Number(weightRaw),
    cod: true,
  })
  return Response.json(result, { headers })
}
