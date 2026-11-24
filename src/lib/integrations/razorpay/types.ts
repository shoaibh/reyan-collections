export interface RazorpayClient {
  mode: 'mock' | 'live'
  keyId: string
  createOrder(input: {
    amountPaise: number
    receipt: string
    notes?: Record<string, string>
  }): Promise<{ id: string; amount: number; currency: 'INR' }>
  refund(paymentId: string, amountPaise: number): Promise<{ id: string }>
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean
  verifyWebhookSignature(rawBody: string, signature: string): boolean
}
