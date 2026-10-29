import { integrationMode } from '../mode'
import { createLiveRazorpay } from './live'
import { mockRazorpay } from './mock'
import type { RazorpayClient } from './types'

export type { RazorpayClient } from './types'

export function getRazorpay(): RazorpayClient {
  if (integrationMode('RAZORPAY') !== 'live') return mockRazorpay
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!keyId || !keySecret || !webhookSecret) {
    throw new Error('Razorpay live mode needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET')
  }
  return createLiveRazorpay({ keyId, keySecret, webhookSecret })
}
