import { randomBytes } from 'node:crypto'

import { hmacHex, safeEqualHex } from './signature'
import type { RazorpayClient } from './types'

/** Dev-only constants, not secrets. */
export const MOCK_RAZORPAY = {
  keyId: 'rzp_test_mock',
  keySecret: 'mock_key_secret',
  webhookSecret: 'mock_webhook_secret',
}

const hex14 = () => randomBytes(7).toString('hex')

export const mockRazorpay: RazorpayClient = {
  mode: 'mock',
  keyId: MOCK_RAZORPAY.keyId,
  async createOrder({ amountPaise }) {
    return { id: `order_mock_${hex14()}`, amount: amountPaise, currency: 'INR' }
  },
  async refund() {
    return { id: `rfnd_mock_${hex14()}` }
  },
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    return safeEqualHex(hmacHex(MOCK_RAZORPAY.keySecret, `${orderId}|${paymentId}`), signature)
  },
  verifyWebhookSignature(rawBody, signature) {
    return safeEqualHex(hmacHex(MOCK_RAZORPAY.webhookSecret, rawBody), signature)
  },
}
