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

/** A non-2xx Shiprocket reply. The message keeps the old "failed with status N" shape. */
class ShiprocketHttpError extends Error {
  constructor(
    path: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Shiprocket ${path} failed with status ${status}`)
  }
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
  if (!res.ok) throw new ShiprocketHttpError(path, res.status, await res.text().catch(() => ''))
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
      let awb: string | undefined
      let courierName = ''
      try {
        const assigned = await request<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>(
          'POST',
          '/courier/assign/awb',
          { shipment_id: shipmentId },
        )
        awb = assigned.response?.data?.awb_code
        courierName = assigned.response?.data?.courier_name ?? ''
        if (!awb) throw new Error('no awb_code in response')
      } catch (err) {
        try {
          await request('POST', '/orders/cancel', { ids: [Number(created.order_id)] })
        } catch {
          // best effort: the original failure is what matters
        }
        const status = /status (\d+)/.exec(err instanceof Error ? err.message : '')?.[1]
        throw new Error('Shiprocket could not assign a courier: ' + (status ?? 'no AWB returned'))
      }

      // The AWB is assigned, so the booking is committed: later failures become warnings.
      const warnings: string[] = []
      try {
        await request('POST', '/courier/generate/pickup', { shipment_id: [shipmentId] })
      } catch {
        warnings.push('Pickup request failed. Schedule the pickup in Shiprocket.')
      }
      let labelUrl: string | null = null
      try {
        const label = await request<{ label_url?: string }>('POST', '/courier/generate/label', {
          shipment_id: [shipmentId],
        })
        labelUrl = label.label_url ?? null
      } catch {
        // handled below
      }
      if (!labelUrl) warnings.push('Label not generated yet. Download it from Shiprocket.')
      return {
        shiprocketOrderId: String(created.order_id),
        shipmentId: String(created.shipment_id),
        awb,
        courierName,
        labelUrl,
        trackingUrl: `https://shiprocket.co/tracking/${awb}`,
        warnings,
      }
    },

    async cancelShipment(shiprocketOrderId: string): Promise<void> {
      try {
        await request('POST', '/orders/cancel', { ids: [Number(shiprocketOrderId)] })
      } catch (err) {
        // Cancel is idempotent: a retry after a later failure (a refund) must not be blocked by the
        // courier saying it is already done. The exact live response is unverified until go-live.
        if (
          err instanceof ShiprocketHttpError &&
          (/already\s+cancel/i.test(err.detail) ||
            (err.status >= 400 && err.status < 500 && /cancelled/i.test(err.detail)))
        ) {
          return
        }
        throw err
      }
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
