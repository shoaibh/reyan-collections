import { hmacHex, safeEqualHex } from './signature'
import type { RazorpayClient } from './types'

const API = 'https://api.razorpay.com/v1'

export interface RazorpayLiveConfig {
  keyId: string
  keySecret: string
  webhookSecret: string
}

/** Razorpay REST via fetch. Unverified until go-live (plan 5). */
export function createLiveRazorpay({ keyId, keySecret, webhookSecret }: RazorpayLiveConfig): RazorpayClient {
  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Razorpay ${path} failed with status ${res.status}`)
    return (await res.json()) as T
  }

  return {
    mode: 'live',
    keyId,
    async createOrder({ amountPaise, receipt, notes }) {
      const json = await post<{ id: string; amount: number }>('/orders', {
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes,
      })
      return { id: json.id, amount: json.amount, currency: 'INR' }
    },
    async refund(paymentId, amountPaise) {
      const json = await post<{ id: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
        amount: amountPaise,
      })
      return { id: json.id }
    },
    verifyPaymentSignature({ orderId, paymentId, signature }) {
      return safeEqualHex(hmacHex(keySecret, `${orderId}|${paymentId}`), signature)
    },
    verifyWebhookSignature(rawBody, signature) {
      return safeEqualHex(hmacHex(webhookSecret, rawBody), signature)
    },
  }
}
