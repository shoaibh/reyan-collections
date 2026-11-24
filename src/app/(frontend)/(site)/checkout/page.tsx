import type { Metadata } from 'next'
import { connection } from 'next/server'
import React from 'react'

import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { loadCommerceSettings } from '@/lib/commerce/settings'
import { getClient } from '@/lib/data/getPayloadClient'
import { turnstileClientConfig } from '@/lib/integrations/turnstile'

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } }

export default async function CheckoutPage() {
  // Integration modes are read from the environment at request time, so this page is never prerendered
  await connection()
  const turnstile = turnstileClientConfig()
  const { prepaidDiscount } = await loadCommerceSettings(await getClient())

  return (
    <section className="mx-auto max-w-[640px] px-[18px] py-6 md:py-10">
      <h1 className="text-3xl font-extrabold md:text-4xl">Checkout</h1>
      <CheckoutForm turnstile={turnstile} prepaidDiscount={prepaidDiscount} />
    </section>
  )
}
