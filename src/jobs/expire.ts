import type { Payload } from 'payload'

import { cancelOrder } from '@/lib/commerce/orderActions'
import { loadCommerceSettings } from '@/lib/commerce/settings'
import type { Order } from '@/payload-types'

type Expirable = 'pending_payment' | 'awaiting_confirmation'

/**
 * Cancels every order still in `status` that is older than the cutoff. Each cancel is its own
 * transaction that re-checks the status under the row lock, so an order paid or confirmed since the
 * query ran is skipped (409). Any other failure is logged and the rest carry on.
 */
async function expire(payload: Payload, status: Expirable, cutoff: Date, note: string): Promise<string[]> {
  const stale = await payload.find({
    collection: 'orders',
    where: { status: { equals: status }, createdAt: { less_than: cutoff.toISOString() } },
    pagination: false,
    depth: 0,
  })
  const cancelled: string[] = []
  for (const order of stale.docs as Order[]) {
    try {
      const result = await cancelOrder(payload, order.id, { by: 'system', note, allowFrom: [status] })
      if (result.ok && result.changed) cancelled.push(order.orderNumber)
      else if (!result.ok && result.status !== 409) {
        payload.logger.error({ orderNumber: order.orderNumber, status: result.status }, 'Could not expire the order')
      }
    } catch (err) {
      payload.logger.error({ err, orderNumber: order.orderNumber }, 'Could not expire the order')
    }
  }
  return cancelled
}

/** Cancels prepaid orders that were not paid within `pendingPaymentMinutes`. Returns the order numbers. */
export async function expirePendingPayments(payload: Payload, now: Date): Promise<string[]> {
  const { pendingPaymentMinutes } = await loadCommerceSettings(payload)
  const cutoff = new Date(now.getTime() - pendingPaymentMinutes * 60_000)
  return expire(payload, 'pending_payment', cutoff, 'Payment not received in time')
}

/** Cancels COD orders that were not confirmed within `codConfirmHours`. Returns the order numbers. */
export async function expireUnconfirmedCod(payload: Payload, now: Date): Promise<string[]> {
  const { codConfirmHours } = await loadCommerceSettings(payload)
  const cutoff = new Date(now.getTime() - codConfirmHours * 3_600_000)
  return expire(payload, 'awaiting_confirmation', cutoff, 'Not confirmed in time')
}
