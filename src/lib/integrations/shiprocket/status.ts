export type CourierStatus = 'shipped' | 'out_for_delivery' | 'delivered' | 'rto'

/** Maps a courier status string (webhook or tracking) to an order status, or null when it is not one we act on. */
export function mapCourierStatus(raw: string): CourierStatus | null {
  const s = raw.toUpperCase()
  if (s.includes('RTO')) return 'rto'
  if (s.includes('OUT FOR DELIVERY')) return 'out_for_delivery'
  if (s.includes('DELIVERED')) return 'delivered'
  if (/PICKED UP|IN TRANSIT|SHIPPED|REACHED|DISPATCHED/.test(s)) return 'shipped'
  return null
}
