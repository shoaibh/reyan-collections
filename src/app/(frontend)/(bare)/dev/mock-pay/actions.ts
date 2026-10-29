'use server'

import { randomBytes } from 'node:crypto'

import { notFound, redirect } from 'next/navigation'

import { handleRazorpayWebhook, recordPaymentFailure, verifyPayment } from '@/lib/commerce/payments'
import { orderUrl } from '@/lib/commerce/paymentLaunch'
import { getClient } from '@/lib/data/getPayloadClient'
import { getRazorpay } from '@/lib/integrations/razorpay'
import { MOCK_RAZORPAY } from '@/lib/integrations/razorpay/mock'
import { hmacHex } from '@/lib/integrations/razorpay/signature'

async function loadOrder(formData: FormData) {
  if (getRazorpay().mode === 'live') notFound()
  const razorpayOrderId = formData.get('razorpayOrderId')
  if (typeof razorpayOrderId !== 'string' || !razorpayOrderId) notFound()
  const payload = await getClient()
  const order = (
    await payload.find({
      collection: 'orders',
      where: { 'razorpay.orderId': { equals: razorpayOrderId } },
      limit: 1,
      depth: 0,
    })
  ).docs[0]
  if (!order) notFound()
  return { payload, order, razorpayOrderId }
}

/** Pretends the customer paid: runs the verify path, then the webhook path, as live Razorpay would. */
export async function succeedPayment(formData: FormData) {
  const { payload, order, razorpayOrderId } = await loadOrder(formData)
  const paymentId = `pay_mock_${randomBytes(7).toString('hex')}`
  await verifyPayment(payload, {
    orderId: razorpayOrderId,
    paymentId,
    signature: hmacHex(MOCK_RAZORPAY.keySecret, `${razorpayOrderId}|${paymentId}`),
  })
  const rawBody = JSON.stringify({
    event: 'order.paid',
    payload: { payment: { entity: { id: paymentId, order_id: razorpayOrderId } }, order: { entity: { id: razorpayOrderId } } },
  })
  await handleRazorpayWebhook(payload, rawBody, hmacHex(MOCK_RAZORPAY.webhookSecret, rawBody))
  redirect(orderUrl(order.orderNumber, order.accessToken))
}

export async function failPayment(formData: FormData) {
  const { payload, order, razorpayOrderId } = await loadOrder(formData)
  await recordPaymentFailure(payload, {
    razorpayOrderId,
    paymentId: `pay_mock_${randomBytes(7).toString('hex')}`,
    reason: 'Test payment failed',
  })
  redirect(orderUrl(order.orderNumber, order.accessToken))
}
