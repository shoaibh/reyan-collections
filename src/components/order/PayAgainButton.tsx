'use client'

import React, { useState } from 'react'

import { launchPayment } from '@/components/checkout/launchPayment'
import type { PaymentLaunch } from '@/lib/commerce/paymentLaunch'

export function PayAgainButton({ payment }: { payment: PaymentLaunch }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pay = async () => {
    setBusy(true)
    setError(null)
    try {
      await launchPayment(payment)
    } catch {
      setError('Could not open the payment window. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="w-full rounded-2xl border-[3px] border-ink bg-cobalt px-6 py-3.5 text-center text-[19px] font-extrabold text-white shadow-[4px_4px_0_var(--color-ink)] disabled:opacity-60"
      >
        Complete payment
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[15px] font-bold text-tomato-deep">
          {error}
        </p>
      ) : null}
    </div>
  )
}
