import type { ServiceabilityInput, ServiceabilityResult, ShiprocketClient } from './types'

const PINCODE = /^[0-9]{6}$/

/**
 * Deterministic stand-in for Shiprocket (spec section 11):
 * 000000 is unserviceable, 111111 is prepaid only, everything else delivers in 3-5 days with COD.
 * Indian pincodes never start with 0, so any leading-zero code is treated like 000000.
 */
export const mockShiprocket: ShiprocketClient = {
  async checkServiceability({ pickupPincode, deliveryPincode, weightGrams }: ServiceabilityInput): Promise<ServiceabilityResult> {
    if (!PINCODE.test(pickupPincode) || !PINCODE.test(deliveryPincode)) {
      throw new Error('Invalid pincode')
    }
    if (!Number.isFinite(weightGrams) || weightGrams <= 0) throw new Error('Invalid weight')

    if (deliveryPincode.startsWith('0')) return { serviceable: false, codAvailable: false }
    if (deliveryPincode === '111111') {
      return { serviceable: true, codAvailable: false, etaDays: { min: 3, max: 5 } }
    }
    return { serviceable: true, codAvailable: true, etaDays: { min: 3, max: 5 } }
  },
}
