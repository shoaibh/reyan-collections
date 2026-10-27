import type { Metadata } from 'next'
import React from 'react'

import { CartContents } from '@/components/cart/CartContents'

export const metadata: Metadata = { title: 'Your cart | Reyan Collections' }

export default function CartPage() {
  return (
    <section className="mx-auto max-w-[640px] px-[18px] py-6 md:py-10">
      <h1 className="text-3xl font-extrabold md:text-4xl">Your cart</h1>
      <div className="mt-4 rounded-3xl border-[3px] border-ink bg-butter shadow-[5px_5px_0_var(--color-ink)]">
        <CartContents active />
      </div>
    </section>
  )
}
