'use client'

import React from 'react'

import type { Quote } from '@/lib/commerce/quote'
import { formatINR } from '@/lib/format'

const minus = (n: number) => `−${formatINR(n)}`

function Row({ id, label, value, strong }: { id: string; label: string; value: string; strong?: boolean }) {
  return (
    <div
      data-testid={`row-${id}`}
      className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t-[3px] border-ink pt-3 text-xl font-extrabold' : 'text-base'}`}
    >
      <dt>{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  )
}

export function OrderSummary({
  quote,
  loading,
  failed,
  onEditCart,
}: {
  quote: Quote | null
  loading: boolean
  failed: boolean
  onEditCart: () => void
}) {
  const t = quote?.totals
  return (
    <section
      aria-labelledby="co-summary-title"
      className="rounded-[18px] border-[3px] border-ink bg-white p-4 shadow-pop-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="co-summary-title" className="text-xl font-extrabold">
          Order summary
        </h2>
        <button
          type="button"
          onClick={onEditCart}
          className="rounded-xl border-[2.5px] border-ink bg-sun px-3.5 py-1.5 text-[15px] font-extrabold text-ink"
        >
          Edit cart
        </button>
      </div>

      {quote && quote.issues.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 rounded-xl border-[2.5px] border-ink bg-butter p-3 text-[15px] font-bold">
          {quote.issues.map((issue) => (
            <li key={`${issue.productId}:${issue.variantId}:${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      {failed ? (
        <p role="alert" className="mt-3 text-[15px] font-bold text-[#b3261e]">
          We couldn&apos;t update your total. Please check your connection and try again.
        </p>
      ) : null}

      {quote ? (
        <ul className="mt-3 flex flex-col gap-2 border-b-[3px] border-ink pb-3">
          {quote.lines.map((l) => (
            <li key={`${l.productId}:${l.variantId}`} className="flex items-baseline justify-between gap-3 text-base">
              <span className="min-w-0">
                {l.title} — {l.variantName} <span className="whitespace-nowrap font-bold">× {l.qty}</span>
              </span>
              <span className="font-bold whitespace-nowrap">{formatINR(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {t ? (
        <dl className={`mt-3 flex flex-col gap-2 ${loading ? 'opacity-60' : ''}`}>
          <Row id="subtotal" label="Subtotal" value={formatINR(t.subtotal)} />
          {t.codeDiscount > 0 ? (
            <Row id="discount" label={`Discount (${quote?.discountCode ?? 'code'})`} value={minus(t.codeDiscount)} />
          ) : null}
          <Row id="shipping" label="Shipping" value={t.shippingFee === 0 ? 'Free' : formatINR(t.shippingFee)} />
          {t.prepaidDiscount > 0 ? (
            <Row id="prepaid" label="Prepaid discount" value={minus(t.prepaidDiscount)} />
          ) : null}
          <Row id="total" label="Total" value={formatINR(t.total)} strong />
        </dl>
      ) : (
        <p role="status" className="mt-3 font-bold text-softer">
          {failed ? '' : 'Updating your total…'}
        </p>
      )}
      <p className="mt-3 text-sm text-softer">Prices include GST</p>
    </section>
  )
}
