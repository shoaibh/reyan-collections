import type { Payload } from 'payload'

import { applyCourierEvent } from '@/lib/commerce/orderActions'
import { getShiprocket } from '@/lib/integrations/shiprocket'

/** Asks the courier about every order in transit and applies what it says. Returns the events applied. */
export async function pollShipmentStatus(payload: Payload): Promise<number> {
  const live = await payload.find({
    collection: 'orders',
    where: { status: { in: ['ready_to_ship', 'shipped', 'out_for_delivery'] } },
    pagination: false,
    depth: 0,
  })
  let applied = 0
  for (const order of live.docs) {
    const awb = order.shipment?.awb
    if (!awb) continue
    try {
      const tracked = await getShiprocket().trackAwb(awb)
      if (!tracked) continue
      const result = await applyCourierEvent(payload, {
        awb,
        rawStatus: tracked.status,
        at: tracked.at,
        raw: tracked,
        source: 'poll',
      })
      applied += result.applied.length
    } catch (err) {
      payload.logger.error({ err, orderNumber: order.orderNumber }, 'Could not poll the courier')
    }
  }
  return applied
}
