import type { Booking, ServiceabilityInput, ServiceabilityResult, ShiprocketClient } from './types'

const PINCODE = /^[0-9]{6}$/

function digits(n: number): string {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
}

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
    if (deliveryPincode === '226001') {
      return {
        serviceable: true,
        codAvailable: true,
        etaDays: { min: 3, max: 5 },
        city: 'Lucknow',
        state: 'Uttar Pradesh',
      }
    }
    return { serviceable: true, codAvailable: true, etaDays: { min: 3, max: 5 } }
  },
  async bookShipment(): Promise<Booking> {
    const awb = `MOCKAWB${digits(10)}`
    return {
      shiprocketOrderId: `MOCKSO${digits(8)}`,
      shipmentId: `MOCKSH${digits(8)}`,
      awb,
      courierName: 'Mock Express',
      labelUrl: `/dev/mock-label?awb=${awb}`,
      trackingUrl: `https://shiprocket.co/tracking/${awb}`,
      warnings: [],
    }
  },
  async cancelShipment(): Promise<void> {},
  async trackAwb() {
    return null
  },
}
