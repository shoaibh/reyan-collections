import { integrationMode } from '../mode'
import { createLiveShiprocket } from './live'
import { mockShiprocket } from './mock'
import type { ShiprocketClient } from './types'

export type {
  Booking,
  ServiceabilityInput,
  ServiceabilityResult,
  ShipmentInput,
  ShiprocketClient,
  TrackResult,
} from './types'
export { MOCK_SHIPROCKET_WEBHOOK_TOKEN } from './types'
export { mapCourierStatus } from './status'

export function getShiprocket(): ShiprocketClient {
  return integrationMode('SHIPROCKET') === 'live' ? createLiveShiprocket() : mockShiprocket
}
