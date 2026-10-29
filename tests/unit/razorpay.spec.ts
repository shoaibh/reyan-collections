import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRazorpay } from '@/lib/integrations/razorpay'
import { MOCK_RAZORPAY } from '@/lib/integrations/razorpay/mock'
import { hmacHex, safeEqualHex } from '@/lib/integrations/razorpay/signature'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('razorpay mock', () => {
  it('verifies payment signatures and rejects tampered or short ones', () => {
    const rz = getRazorpay()
    expect(rz.mode).toBe('mock')
    expect(rz.keyId).toBe(MOCK_RAZORPAY.keyId)
    const sig = hmacHex(MOCK_RAZORPAY.keySecret, 'order_1|pay_1')
    expect(rz.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: sig })).toBe(true)
    expect(rz.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_2', signature: sig })).toBe(false)
    expect(rz.verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'abc' })).toBe(false)
  })

  it('verifies webhook signatures', () => {
    const body = '{"a":1}'
    const sig = hmacHex(MOCK_RAZORPAY.webhookSecret, body)
    expect(getRazorpay().verifyWebhookSignature(body, sig)).toBe(true)
    expect(getRazorpay().verifyWebhookSignature('{"a":2}', sig)).toBe(false)
  })

  it('creates orders and refunds with mock ids', async () => {
    const rz = getRazorpay()
    const order = await rz.createOrder({ amountPaise: 80800, receipt: 'RC1001' })
    expect(order.id).toMatch(/^order_mock_[0-9a-f]{14}$/)
    expect(order.amount).toBe(80800)
    expect(order.currency).toBe('INR')
    expect((await rz.refund('pay_1', 100)).id).toMatch(/^rfnd_mock_[0-9a-f]{14}$/)
  })

  it('safeEqualHex is false on length mismatch', () => {
    expect(safeEqualHex('ab', 'abcd')).toBe(false)
    expect(safeEqualHex('abcd', 'abcd')).toBe(true)
  })
})

describe('razorpay live', () => {
  function liveEnv() {
    vi.stubEnv('RAZORPAY_MODE', 'live')
    vi.stubEnv('RAZORPAY_KEY_ID', 'key')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'whsec')
  }

  it('throws when env is missing', () => {
    vi.stubEnv('RAZORPAY_MODE', 'live')
    vi.stubEnv('RAZORPAY_KEY_ID', '')
    expect(() => getRazorpay()).toThrow()
  })

  it('createOrder posts to the orders endpoint with basic auth', async () => {
    liveEnv()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'order_X', amount: 80800, currency: 'INR' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const order = await getRazorpay().createOrder({ amountPaise: 80800, receipt: 'RC1001' })
    expect(order).toEqual({ id: 'order_X', amount: 80800, currency: 'INR' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.razorpay.com/v1/orders')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Basic ' + Buffer.from('key:secret').toString('base64'),
    )
    expect(JSON.parse(init.body as string)).toMatchObject({ amount: 80800, currency: 'INR', receipt: 'RC1001' })
  })

  it('rejects on a 401 with the status in the message', async () => {
    liveEnv()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await expect(getRazorpay().createOrder({ amountPaise: 100, receipt: 'r' })).rejects.toThrow(/401/)
  })

  it('refund posts to the payment refund endpoint', async () => {
    liveEnv()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'rfnd_X' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getRazorpay().refund('pay_9', 500)).toEqual({ id: 'rfnd_X' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.razorpay.com/v1/payments/pay_9/refund')
    expect(JSON.parse(init.body as string)).toEqual({ amount: 500 })
  })
})
