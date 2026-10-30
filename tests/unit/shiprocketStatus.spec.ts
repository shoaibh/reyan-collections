import { describe, expect, it } from 'vitest'
import { mapCourierStatus } from '@/lib/integrations/shiprocket/status'

describe('mapCourierStatus', () => {
  it.each([
    ['Picked Up', 'shipped'],
    ['IN TRANSIT', 'shipped'],
    ['Out For Delivery', 'out_for_delivery'],
    ['DELIVERED', 'delivered'],
    ['RTO DELIVERED', 'rto'],
    ['RTO Initiated', 'rto'],
    ['Pickup Scheduled', null],
  ])('maps %s to %s', (raw, expected) => {
    expect(mapCourierStatus(raw)).toBe(expected)
  })
})
