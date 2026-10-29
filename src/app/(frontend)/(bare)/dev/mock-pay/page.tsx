import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { orderUrl } from '@/lib/commerce/paymentLaunch'
import { getClient } from '@/lib/data/getPayloadClient'
import { formatINR } from '@/lib/format'
import { getRazorpay } from '@/lib/integrations/razorpay'

import { failPayment, succeedPayment } from './actions'

export const metadata: Metadata = { title: 'Test payment', robots: { index: false, follow: false } }

const button = 'w-full rounded-2xl border-[3px] border-ink px-6 py-3.5 text-center text-[19px] font-extrabold'

/** Stands in for Razorpay Checkout while RAZORPAY_MODE is mock. Not reachable in live mode. */
export default async function MockPayPage({ searchParams }: { searchParams: Promise<{ order?: string | string[] }> }) {
  if (getRazorpay().mode === 'live') notFound()
  const { order: param } = await searchParams
  const razorpayOrderId = typeof param === 'string' ? param : ''
  if (!razorpayOrderId) notFound()

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
  if (order.status !== 'pending_payment') redirect(orderUrl(order.orderNumber, order.accessToken))

  return (
    <div className="mx-auto min-h-screen max-w-[480px] px-[22px] pt-[34px] pb-10">
      <div className="rounded-2xl border-[3px] border-ink bg-white p-6 shadow-[5px_5px_0_var(--color-ink)]">
        <h1 className="text-[27px] font-extrabold tracking-[-0.035em]">Test payment</h1>
        <p className="mt-2 text-[15px]">This is a test payment page. No money moves.</p>
        <p className="mt-4 text-[17px] font-extrabold">Order {order.orderNumber}</p>
        <p className="text-[17px] font-extrabold">{formatINR(order.total ?? 0)}</p>
        <div className="mt-6 flex flex-col gap-3">
          <form action={succeedPayment}>
            <input type="hidden" name="razorpayOrderId" value={razorpayOrderId} />
            <button type="submit" className={`${button} bg-cobalt text-white shadow-[4px_4px_0_var(--color-ink)]`}>
              Succeed
            </button>
          </form>
          <form action={failPayment}>
            <input type="hidden" name="razorpayOrderId" value={razorpayOrderId} />
            <button type="submit" className={`${button} bg-white text-tomato-deep shadow-[4px_4px_0_var(--color-ink)]`}>
              Fail
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
