'use client'

import React from 'react'

import { useCart } from '@/components/cart/CartProvider'

export function CartButton() {
  const { count, setOpen } = useCart()
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
      className="relative flex size-[38px] items-center justify-center rounded-full border-[2.5px] border-ink bg-tomato text-ink shadow-[2px_2px_0_var(--color-ink)] md:size-auto md:gap-2 md:px-[18px] md:py-[9px] md:font-bold md:shadow-pop-sm"
    >
      <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
        <path d="M2 3h2l1.6 8h8l1.4-6H5" fill="none" stroke="#1E1B4B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="7" cy="14.5" r="1.3" fill="#1E1B4B" />
        <circle cx="12.5" cy="14.5" r="1.3" fill="#1E1B4B" />
      </svg>
      <span className="hidden md:inline">Cart</span>
      <b
        aria-hidden="true"
        className="absolute -top-1.5 -right-1.5 grid min-w-[22px] place-items-center rounded-full border-2 border-ink bg-sun px-1 py-0.5 text-[11px] leading-none font-extrabold text-ink md:static md:size-[22px] md:p-0 md:text-xs"
      >
        {count}
      </b>
    </button>
  )
}
