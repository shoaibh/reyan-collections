import type { Metadata } from 'next'
import React from 'react'

import { TrackForm } from '@/components/order/TrackForm'

export const metadata: Metadata = { title: 'Track your order' }

export default function TrackPage() {
  return (
    <section className="mx-auto max-w-[640px] px-[18px] py-6 md:py-10">
      <h1 className="text-3xl font-extrabold md:text-4xl">Track your order</h1>
      <p className="mt-2 text-[17px] text-soft">Enter your order number and the mobile number you ordered with.</p>
      <div className="mt-4">
        <TrackForm />
      </div>
    </section>
  )
}
