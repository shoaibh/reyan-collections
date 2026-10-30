import type { Order } from '@/payload-types'

export interface ServiceabilityInput {
  pickupPincode: string
  deliveryPincode: string
  weightGrams: number
  cod: boolean
}

export interface ServiceabilityResult {
  serviceable: boolean
  codAvailable: boolean
  etaDays?: { min: number; max: number }
  city?: string
  state?: string
}

export type ShipmentInput = {
  orderNumber: string
  orderDate: string
  pickupLocation: string
  customer: { name: string; phone: string; email: string | null }
  address: Order['address']
  items: { name: string; sku: string; units: number; sellingPrice: number; hsn: string }[]
  paymentMethod: 'Prepaid' | 'COD'
  subTotal: number
  weightKg: number
  lengthCm: number
  breadthCm: number
  heightCm: number
}

export type Booking = {
  shiprocketOrderId: string
  shipmentId: string
  awb: string
  courierName: string
  labelUrl: string | null
  trackingUrl: string
  warnings: string[]
}

export type TrackResult = { status: string; at: string } | null

export interface ShiprocketClient {
  checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult>
  /** Create adhoc order, assign AWB (recommended courier), generate pickup, generate label. */
  bookShipment(input: ShipmentInput): Promise<Booking>
  cancelShipment(shiprocketOrderId: string): Promise<void>
  trackAwb(awb: string): Promise<TrackResult>
}

export const MOCK_SHIPROCKET_WEBHOOK_TOKEN = 'mock_shiprocket_token'
