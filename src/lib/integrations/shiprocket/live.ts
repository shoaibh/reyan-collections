import type {
  Booking,
  ServiceabilityInput,
  ServiceabilityResult,
  ShipmentInput,
  ShiprocketClient,
  TrackResult,
} from './types'

const API = 'https://apiv2.shiprocket.in/v1/external'
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000

let cached: { token: string; expiresAt: number } | null = null

/** Test only: forget the cached auth token. */
export function __resetShiprocketToken(): void {
  cached = null
}

async function login(): Promise<string> {
  const email = process.env.SHIPROCKET_EMAIL
  const password = process.env.SHIPROCKET_PASSWORD
  if (!email) throw new Error('SHIPROCKET_EMAIL is required in live mode')
  if (!password) throw new Error('SHIPROCKET_PASSWORD is required in live mode')
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Shiprocket /auth/login failed with status ${res.status}`)
  const json = (await res.json()) as { token?: string }
  if (!json.token) throw new Error('Shiprocket /auth/login returned no token')
  cached = { token: json.token, expiresAt: Date.now() + TOKEN_TTL_MS }
  return json.token
}

async function getToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token
  return login()
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const send = async (token: string) =>
    fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
  let res = await send(await getToken())
  if (res.status === 401) {
    cached = null
    res = await send(await login())
  }
  if (!res.ok) throw new Error(`Shiprocket ${path} failed with status ${res.status}`)
  return (await res.json()) as T
}

interface Courier {
  estimated_delivery_days?: string | number
  city?: string
  state?: string
  cod?: number
}

/** Shiprocket REST via fetch. Unverified until go-live. */
export function createLiveShiprocket(): ShiprocketClient {
  return {
    async checkServiceability({
      pickupPincode,
      deliveryPincode,
      weightGrams,
      cod,
    }: ServiceabilityInput): Promise<ServiceabilityResult> {
      const qs = new URLSearchParams({
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        weight: String(weightGrams / 1000),
        cod: cod ? '1' : '0',
      })
      const json = await request<{ data?: { available_courier_companies?: Courier[] } }>(
        'GET',
        `/courier/serviceability/?${qs.toString()}`,
      )
      const couriers = json.data?.available_courier_companies ?? []
      if (couriers.length === 0) return { serviceable: false, codAvailable: false }
      const days = (c: Courier) => {
        const n = Number(c.estimated_delivery_days)
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
      }
      const best = couriers.reduce((a, b) => (days(b) < days(a) ? b : a))
      const d = days(best)
      return {
        serviceable: true,
        codAvailable: couriers.some((c) => c.cod === 1),
        ...(Number.isFinite(d) ? { etaDays: { min: d, max: d + 2 } } : {}),
        ...(best.city ? { city: best.city } : {}),
        ...(best.state ? { state: best.state } : {}),
      }
    },

    async bookShipment(input: ShipmentInput): Promise<Booking> {
      const a = input.address
      const created = await request<{ order_id: number | string; shipment_id: number | string }>(
        'POST',
        '/orders/create/adhoc',
        {
          order_id: input.orderNumber,
          order_date: input.orderDate,
          pickup_location: input.pickupLocation,
          billing_customer_name: input.customer.name,
          billing_last_name: '',
          billing_address: [a?.line1, a?.line2].filter(Boolean).join(' '),
          billing_city: a?.city ?? '',
          billing_pincode: a?.pincode ?? '',
          billing_state: a?.state ?? '',
          billing_country: 'India',
          billing_email: input.customer.email ?? '',
          billing_phone: input.customer.phone,
          shipping_is_billing: true,
          order_items: input.items.map((i) => ({
            name: i.name,
            sku: i.sku,
            units: i.units,
            selling_price: i.sellingPrice,
            hsn: i.hsn,
          })),
          payment_method: input.paymentMethod,
          sub_total: input.subTotal,
          length: input.lengthCm,
          breadth: input.breadthCm,
          height: input.heightCm,
          weight: input.weightKg,
        },
      )
      const shipmentId = Number(created.shipment_id)
      const assigned = await request<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>(
        'POST',
        '/courier/assign/awb',
        { shipment_id: shipmentId },
      )
      const awb = assigned.response?.data?.awb_code
      if (!awb) throw new Error('Shiprocket did not assign an AWB')
      await request('POST', '/courier/generate/pickup', { shipment_id: [shipmentId] })
      const label = await request<{ label_url?: string }>('POST', '/courier/generate/label', {
        shipment_id: [shipmentId],
      })
      return {
        shiprocketOrderId: String(created.order_id),
        shipmentId: String(created.shipment_id),
        awb,
        courierName: assigned.response?.data?.courier_name ?? '',
        labelUrl: label.label_url ?? null,
        trackingUrl: `https://shiprocket.co/tracking/${awb}`,
      }
    },

    async cancelShipment(shiprocketOrderId: string): Promise<void> {
      await request('POST', '/orders/cancel', { ids: [Number(shiprocketOrderId)] })
    },

    async trackAwb(awb: string): Promise<TrackResult> {
      const json = await request<{
        tracking_data?: { shipment_track?: { current_status?: string; updated_time?: string }[] }
      }>('GET', `/courier/track/awb/${encodeURIComponent(awb)}`)
      const t = json.tracking_data?.shipment_track?.[0]
      if (!t?.current_status) return null
      return { status: t.current_status, at: t.updated_time ?? new Date().toISOString() }
    },
  }
}
