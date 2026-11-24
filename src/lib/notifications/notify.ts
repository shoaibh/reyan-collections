import type { Payload } from 'payload'

import type { Order } from '@/payload-types'
import { getEmail } from '@/lib/integrations/email'
import { renderEmail, type NotifyEvent } from './templates'

/**
 * Sends the email for an order event. Call after the transaction commits. Never throws: failures are
 * logged, and nothing is sent when there is no recipient address.
 */
export async function notify(
  payload: Payload,
  event: NotifyEvent,
  order: Order,
  extra?: { refundAmount?: number },
): Promise<void> {
  try {
    const settings = await payload.findGlobal({ slug: 'store-settings', depth: 0 })
    const to = event === 'admin_new_order' ? settings.business?.email : order.customer?.email
    if (!to) return
    const { subject, html } = renderEmail(event, order, {
      siteUrl: process.env.NEXT_PUBLIC_SERVER_URL ?? '',
      storeName: settings.business?.name || 'Reyan Collections',
      refundAmount: extra?.refundAmount,
    })
    await getEmail(payload).send({ to, subject, html, tag: event, orderNumber: order.orderNumber })
  } catch (err) {
    payload.logger.error({ err, event, orderNumber: order.orderNumber }, 'Notification failed')
  }
}
