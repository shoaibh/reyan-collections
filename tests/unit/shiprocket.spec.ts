import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getShiprocket } from '@/lib/integrations/shiprocket'
import { __resetShiprocketToken, createLiveShiprocket } from '@/lib/integrations/shiprocket/live'
import { mockShiprocket } from '@/lib/integrations/shiprocket/mock'
import type { ShipmentInput } from '@/lib/integrations/shiprocket/types'

const shipment: ShipmentInput = {
  orderNumber: 'RC1001',
  orderDate: '2026-10-30 10:15',
  pickupLocation: 'Primary',
  customer: { name: 'Asha Rao', phone: '9876543210', email: null },
  address: { line1: '12 MG Road', line2: 'Flat 4', city: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001' },
  items: [{ name: 'Kurti', sku: 'KUR-1', units: 2, sellingPrice: 499, hsn: '6104' }],
  paymentMethod: 'COD',
  subTotal: 998,
  weightKg: 0.5,
  lengthCm: 20,
  breadthCm: 15,
  heightCm: 5,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  __resetShiprocketToken()
  vi.stubEnv('SHIPROCKET_EMAIL', 'ops@example.com')
  vi.stubEnv('SHIPROCKET_PASSWORD', 'pw')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('shiprocket mock', () => {
  it('books with the documented id formats', async () => {
    const b = await mockShiprocket.bookShipment(shipment)
    expect(b.shiprocketOrderId).toMatch(/^MOCKSO[0-9]{8}$/)
    expect(b.shipmentId).toMatch(/^MOCKSH[0-9]{8}$/)
    expect(b.awb).toMatch(/^MOCKAWB[0-9]{10}$/)
    expect(b.courierName).toBe('Mock Express')
    expect(b.labelUrl).toBe(`/dev/mock-label?awb=${b.awb}`)
    expect(b.trackingUrl).toBe(`https://shiprocket.co/tracking/${b.awb}`)
    expect(b.warnings).toEqual([])
    await expect(mockShiprocket.cancelShipment(b.shiprocketOrderId)).resolves.toBeUndefined()
    expect(await mockShiprocket.trackAwb(b.awb)).toBeNull()
  })

  it('getShiprocket returns the live client in live mode', async () => {
    vi.stubEnv('SHIPROCKET_MODE', 'live')
    const fetchMock = vi.fn(async (url: string) =>
      String(url).endsWith('/auth/login') ? json({ token: 't' }) : json({ tracking_data: { shipment_track: [] } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    expect(await getShiprocket().trackAwb('A1')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('/courier/track/awb/A1')
  })
})

describe('shiprocket live', () => {
  it('logs in once across calls (token cached)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) return json({ token: 'tok1' })
      return json({ tracking_data: { shipment_track: [] } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const sr = createLiveShiprocket()
    await sr.trackAwb('A1')
    await sr.trackAwb('A2')
    const logins = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/auth/login'))
    expect(logins).toHaveLength(1)
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok1')
  })

  it('re-logs in once on a 401 and retries', async () => {
    let tokens = 0
    let tracks = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) return json({ token: `tok${++tokens}` })
      tracks++
      if (tracks === 1) return json({}, 401)
      return json({ tracking_data: { shipment_track: [{ current_status: 'Delivered', updated_time: '2026-10-31 09:00:00' }] } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const res = await createLiveShiprocket().trackAwb('A1')
    expect(res).toEqual({ status: 'Delivered', at: '2026-10-31 09:00:00' })
    expect(tokens).toBe(2)
    expect(tracks).toBe(2)
  })

  it('throws with the status on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/auth/login') ? json({ token: 't' }) : json({}, 500))))
    await expect(createLiveShiprocket().trackAwb('A1')).rejects.toThrow('500')
  })

  it('books through the four endpoints in order', async () => {
    const calls: { url: string; body: Record<string, unknown> | null }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
        if (url.endsWith('/auth/login')) return json({ token: 't' })
        if (url.endsWith('/orders/create/adhoc')) return json({ order_id: 555, shipment_id: 777 })
        if (url.endsWith('/courier/assign/awb')) return json({ response: { data: { awb_code: 'AWB123', courier_name: 'Delhivery' } } })
        if (url.endsWith('/courier/generate/pickup')) return json({ pickup_status: 1 })
        return json({ label_url: 'https://label/1.pdf' })
      }),
    )
    const booking = await createLiveShiprocket().bookShipment(shipment)
    expect(booking).toEqual({
      shiprocketOrderId: '555',
      shipmentId: '777',
      awb: 'AWB123',
      courierName: 'Delhivery',
      labelUrl: 'https://label/1.pdf',
      trackingUrl: 'https://shiprocket.co/tracking/AWB123',
      warnings: [],
    })
    const paths = calls.map((c) => c.url.replace('https://apiv2.shiprocket.in/v1/external', ''))
    expect(paths).toEqual(['/auth/login', '/orders/create/adhoc', '/courier/assign/awb', '/courier/generate/pickup', '/courier/generate/label'])
    expect(calls[1].body).toMatchObject({
      order_id: 'RC1001',
      order_date: '2026-10-30 10:15',
      pickup_location: 'Primary',
      billing_customer_name: 'Asha Rao',
      billing_last_name: '',
      billing_address: '12 MG Road Flat 4',
      billing_pincode: '226001',
      billing_country: 'India',
      shipping_is_billing: true,
      payment_method: 'COD',
      sub_total: 998,
      weight: 0.5,
    })
    expect(calls[2].body).toEqual({ shipment_id: 777 })
    expect(calls[3].body).toEqual({ shipment_id: [777] })
    expect(calls[4].body).toEqual({ shipment_id: [777] })
  })

  it('cancels by order id', async () => {
    const calls: { url: string; body: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
        return url.endsWith('/auth/login') ? json({ token: 't' }) : json({})
      }),
    )
    await createLiveShiprocket().cancelShipment('555')
    expect(calls[1].url.endsWith('/orders/cancel')).toBe(true)
    expect(calls[1].body).toEqual({ ids: [555] })
  })

  it('maps serviceability to the fastest courier', async () => {
    let requested = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth/login')) return json({ token: 't' })
        requested = url
        return json({
          data: {
            available_courier_companies: [
              { courier_name: 'Slow', estimated_delivery_days: '5', city: 'Slowville', state: 'X', cod: 1 },
              { courier_name: 'Fast', estimated_delivery_days: '2', city: 'LUCKNOW', state: 'Uttar Pradesh', cod: 0 },
            ],
          },
        })
      }),
    )
    const res = await createLiveShiprocket().checkServiceability({
      pickupPincode: '110001',
      deliveryPincode: '226001',
      weightGrams: 500,
      cod: true,
    })
    expect(res).toEqual({
      serviceable: true,
      codAvailable: true,
      etaDays: { min: 2, max: 4 },
      city: 'LUCKNOW',
      state: 'Uttar Pradesh',
    })
    const u = new URL(requested)
    expect(u.pathname.endsWith('/courier/serviceability/')).toBe(true)
    expect(u.searchParams.get('weight')).toBe('0.5')
    expect(u.searchParams.get('cod')).toBe('1')
    expect(u.searchParams.get('pickup_postcode')).toBe('110001')
    expect(u.searchParams.get('delivery_postcode')).toBe('226001')
  })

  it('reports unserviceable for an empty courier list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/auth/login') ? json({ token: 't' }) : json({ data: { available_courier_companies: [] } }),
      ),
    )
    const res = await createLiveShiprocket().checkServiceability({
      pickupPincode: '110001',
      deliveryPincode: '226001',
      weightGrams: 500,
      cod: false,
    })
    expect(res).toEqual({ serviceable: false, codAvailable: false })
  })

  it('throws when credentials are missing', async () => {
    vi.stubEnv('SHIPROCKET_EMAIL', '')
    vi.stubGlobal('fetch', vi.fn())
    await expect(createLiveShiprocket().trackAwb('A1')).rejects.toThrow('SHIPROCKET_EMAIL')
  })
})

function bookingFetch(fail: string | null, calls: string[] = []) {
  return vi.fn(async (url: string) => {
    const path = url.replace('https://apiv2.shiprocket.in/v1/external', '')
    calls.push(path)
    if (path === fail) return json({}, 500)
    if (path === '/auth/login') return json({ token: 't' })
    if (path === '/orders/create/adhoc') return json({ order_id: 555, shipment_id: 777 })
    if (path === '/courier/assign/awb') return json({ response: { data: { awb_code: 'AWB123', courier_name: 'Delhivery' } } })
    if (path === '/courier/generate/pickup') return json({ pickup_status: 1 })
    return json({ label_url: 'https://label/1.pdf' })
  })
}

describe('shiprocket live booking failures', () => {
  it('keeps the booking when pickup fails', async () => {
    vi.stubGlobal('fetch', bookingFetch('/courier/generate/pickup'))
    const b = await createLiveShiprocket().bookShipment(shipment)
    expect(b.awb).toBe('AWB123')
    expect(b.labelUrl).toBe('https://label/1.pdf')
    expect(b.warnings).toEqual(['Pickup request failed. Schedule the pickup in Shiprocket.'])
  })

  it('keeps the booking when the label fails', async () => {
    vi.stubGlobal('fetch', bookingFetch('/courier/generate/label'))
    const b = await createLiveShiprocket().bookShipment(shipment)
    expect(b.awb).toBe('AWB123')
    expect(b.labelUrl).toBeNull()
    expect(b.warnings).toEqual(['Label not generated yet. Download it from Shiprocket.'])
  })

  it('cancels the created order and rejects when AWB assignment fails', async () => {
    const calls: string[] = []
    const fetchMock = bookingFetch('/courier/assign/awb', calls)
    vi.stubGlobal('fetch', fetchMock)
    await expect(createLiveShiprocket().bookShipment(shipment)).rejects.toThrow(
      'Shiprocket could not assign a courier: 500',
    )
    expect(calls).toContain('/orders/cancel')
    const cancel = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/orders/cancel')) as unknown as [string, RequestInit]
    expect(JSON.parse(String(cancel[1].body))).toEqual({ ids: [555] })
  })

  it('rejects when login fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 403)))
    await expect(createLiveShiprocket().trackAwb('A1')).rejects.toThrow('403')
  })
})
