import React from 'react'

import { formatINR } from '@/lib/format'

/** Ticket-shaped tag: "₹1,299 here / ₹1,499 on Amazon". */
export function PriceTag({
  price,
  compare,
  marketplace = 'Amazon',
  className = 'relative',
}: {
  price: number
  compare: number
  marketplace?: string
  className?: string
}) {
  return (
    <div
      data-testid="price-tag"
      className={`w-fit -rotate-[4deg] rounded-xl border-[3px] border-ink bg-sun py-[9px] pr-[13px] pl-6 text-[17px] leading-[1.15] font-extrabold text-ink shadow-[4px_4px_0_var(--color-ink)] before:absolute before:top-1/2 before:left-[9px] before:size-[9px] before:-translate-y-1/2 before:rounded-full before:border-[2.5px] before:border-ink before:bg-butter before:content-[''] md:py-3 md:pr-[18px] md:pl-7 md:text-[22px] md:shadow-pop ${className}`}
    >
      <span>{formatINR(price)} here</span>
      <br />
      <s className="text-[11.5px] font-medium opacity-75 md:text-sm">
        {formatINR(compare)} on {marketplace}
      </s>
    </div>
  )
}
