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

export interface ShiprocketClient {
  checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult>
}
