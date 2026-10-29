import { describe, expect, it } from 'vitest'

import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  nextStatuses,
  type OrderStatus,
} from '@/lib/commerce/orderStateMachine'

const allowed: [OrderStatus, OrderStatus][] = [
  ['pending_payment', 'confirmed'],
  ['pending_payment', 'cancelled'],
  ['awaiting_confirmation', 'confirmed'],
  ['awaiting_confirmation', 'cancelled'],
  ['confirmed', 'ready_to_ship'],
  ['confirmed', 'cancelled'],
  ['ready_to_ship', 'shipped'],
  ['ready_to_ship', 'cancelled'],
  ['shipped', 'out_for_delivery'],
  ['shipped', 'delivered'],
  ['shipped', 'rto'],
  ['out_for_delivery', 'delivered'],
  ['out_for_delivery', 'rto'],
  ['delivered', 'returned'],
]

describe('orderStateMachine', () => {
  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
  })

  it('rejects invalid transitions', () => {
    expect(canTransition('delivered', 'shipped')).toBe(false)
    expect(canTransition('pending_payment', 'shipped')).toBe(false)
    expect(canTransition('cancelled', 'confirmed')).toBe(false)
  })

  it('allows cancelled -> confirmed only for a late payment', () => {
    expect(canTransition('cancelled', 'confirmed', { latePayment: true })).toBe(true)
    expect(canTransition('cancelled', 'ready_to_ship', { latePayment: true })).toBe(false)
  })

  it('keeps rto, returned and cancelled terminal', () => {
    expect(nextStatuses('rto')).toEqual([])
    expect(nextStatuses('returned')).toEqual([])
    expect(nextStatuses('cancelled')).toEqual([])
  })

  it('throws on an invalid assert', () => {
    expect(() => assertTransition('delivered', 'shipped')).toThrow(InvalidTransitionError)
    expect(() => assertTransition('confirmed', 'ready_to_ship')).not.toThrow()
  })

  it('lists next statuses', () => {
    expect(nextStatuses('shipped')).toEqual(['out_for_delivery', 'delivered', 'rto'])
  })
})
