import { integrationMode } from '../mode'
import { mockShiprocket } from './mock'
import type { ShiprocketClient } from './types'

export type { ServiceabilityInput, ServiceabilityResult, ShiprocketClient } from './types'

export function getShiprocket(): ShiprocketClient {
  if (integrationMode('SHIPROCKET') === 'live') {
    throw new Error('Shiprocket live mode is not implemented until plan 4')
  }
  return mockShiprocket
}
