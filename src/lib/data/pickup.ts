import type { Payload } from 'payload'

const PINCODE = /^[0-9]{6}$/
// Only mock mode may fall back: it just needs a well-formed value
const MOCK_FALLBACK = '110001'

/** The pickup pincode shipments leave from, read server-side from Store Settings. */
export async function getPickupPincode(payload: Payload): Promise<string> {
  const settings = await payload.findGlobal({ slug: 'store-settings', depth: 0 })
  const business = settings.business
  const pickup = business?.pickupAddress?.pincode?.trim() ?? ''
  if (business?.pickupSameAsBusiness === false && PINCODE.test(pickup)) return pickup
  const main = business?.address?.pincode?.trim() ?? ''
  if (PINCODE.test(main)) return main
  if (process.env.SHIPROCKET_MODE === 'live') throw new Error('Set the pickup pincode in Store Settings')
  return MOCK_FALLBACK
}
