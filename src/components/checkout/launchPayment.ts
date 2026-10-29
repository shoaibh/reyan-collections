import type { PaymentLaunch } from '@/lib/commerce/paymentLaunch'

/** A PaymentLaunch whose prefill may omit contact and email (the order page sends name only). */
export type LaunchInput = Omit<PaymentLaunch, 'prefill'> & {
  prefill: { name: string; contact?: string; email?: string }
}

type RazorpayHandlerResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}
type RazorpayOptions = {
  key: string
  order_id: string
  amount: number
  currency: string
  name: string
  timeout: number
  prefill: LaunchInput['prefill']
  handler: (response: RazorpayHandlerResponse) => void
  modal: { ondismiss: () => void }
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void }
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    const fail = () => {
      scriptPromise = null
      el.remove()
      reject(new Error('Could not load the payment window'))
    }
    el.src = SCRIPT_SRC
    el.async = true
    el.onload = () => (window.Razorpay ? resolve() : fail())
    el.onerror = fail
    document.head.appendChild(el)
  })
  return scriptPromise
}

/** Opens the payment step: the dev mock page, or Razorpay Checkout in live mode. */
export async function launchPayment(p: LaunchInput): Promise<void> {
  if (p.mode === 'mock') {
    const path = '/dev/mock-pay?order=' + encodeURIComponent(p.razorpayOrderId)
    window.location.assign(new URL(path, window.location.origin).href)
    return
  }
  await loadScript()
  const Razorpay = window.Razorpay
  if (!Razorpay) throw new Error('Could not load the payment window')
  const checkout = new Razorpay({
    key: p.keyId,
    order_id: p.razorpayOrderId,
    amount: p.amountPaise,
    currency: p.currency,
    name: 'Reyan Collections',
    timeout: 900,
    prefill: p.prefill,
    handler: (response) => {
      void (async () => {
        try {
          const res = await fetch('/api/checkout/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(response),
          })
          const json = (await res.json()) as { url?: string }
          window.location.assign(json.url ?? p.orderUrl)
        } catch {
          window.location.assign(p.orderUrl)
        }
      })()
    },
    modal: { ondismiss: () => window.location.assign(p.orderUrl) },
  })
  checkout.open()
}
