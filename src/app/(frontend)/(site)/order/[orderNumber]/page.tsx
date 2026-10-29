import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { PayAgainButton } from '@/components/order/PayAgainButton'
import { OrderTimeline } from '@/components/order/OrderTimeline'
import { getOrderForCustomer } from '@/lib/commerce/customerOrder'
import { getClient } from '@/lib/data/getPayloadClient'
import { formatINR } from '@/lib/format'

type Params = Promise<{ orderNumber: string }>
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false } }

const card = 'rounded-[18px] border-[3px] border-ink bg-white p-4 shadow-pop-sm'
const linkBtn =
  'rounded-2xl border-[3px] border-ink bg-sun px-6 py-3.5 text-center text-[19px] font-extrabold text-ink shadow-[4px_4px_0_var(--color-ink)]'

export default async function OrderPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { orderNumber } = await params
  const t = (await searchParams).t
  const token = typeof t === 'string' ? t : null
  const order = await getOrderForCustomer(await getClient(), orderNumber, token)
  if (!order) notFound()

  const { totals } = order
  const rows: { label: string; value: string }[] = [
    { label: 'Subtotal', value: formatINR(totals.subtotal) },
    ...(totals.codeDiscount > 0
      ? [{ label: `Discount (${order.discountCode ?? 'code'})`, value: `−${formatINR(totals.codeDiscount)}` }]
      : []),
    { label: 'Shipping', value: totals.shippingFee > 0 ? formatINR(totals.shippingFee) : 'Free' },
    ...(totals.prepaidDiscount > 0
      ? [{ label: 'Prepaid discount', value: `−${formatINR(totals.prepaidDiscount)}` }]
      : []),
  ]

  return (
    <section className="mx-auto flex max-w-[640px] flex-col gap-4 px-[18px] py-6 md:py-10">
      <div className="rounded-3xl border-[3px] border-ink bg-butter p-5 shadow-[5px_5px_0_var(--color-ink)]">
        <h1 className="text-3xl font-extrabold md:text-4xl">{order.heading}</h1>
        {order.message ? <p className="mt-2 text-[17px]">{order.message}</p> : null}
        <p className="mt-2 text-[17px] font-bold">Order {order.orderNumber}</p>
        <p className="mt-2 text-[15px] text-soft">
          Save or screenshot this page. You&apos;ll need your order number to track it.
        </p>
      </div>

      <div className={card}>
        <OrderTimeline step={order.step} />
      </div>

      <div className={card}>
        <h2 className="mb-2 text-xl font-extrabold">Items</h2>
        <ul className="flex flex-col gap-2">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3 text-[16px]">
              <span>
                {item.label} × {item.qty}
              </span>
              <span className="font-bold">{formatINR(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1 border-t-2 border-ink pt-3 text-[16px]">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between">
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
          <div className="flex justify-between text-lg font-extrabold">
            <dt>Total</dt>
            <dd>{formatINR(totals.total)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[15px] font-bold text-soft">{order.paymentLabel}</p>
      </div>

      <div className={card}>
        <h2 className="mb-2 text-xl font-extrabold">Shipping to</h2>
        <p className="text-[16px] font-bold">{order.shipTo.name}</p>
        <p className="text-[16px]">{order.shipTo.phone}</p>
        <p className="text-[16px]">{order.shipTo.place}</p>
      </div>

      <div className="flex flex-col gap-3">
        {order.payment ? <PayAgainButton payment={order.payment} /> : null}
        {order.trackingUrl ? (
          <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" className={linkBtn}>
            Track your parcel
          </a>
        ) : null}
        {order.whatsappUrl ? (
          <a href={order.whatsappUrl} target="_blank" rel="noopener noreferrer" className={linkBtn}>
            Chat on WhatsApp
          </a>
        ) : null}
      </div>
    </section>
  )
}
