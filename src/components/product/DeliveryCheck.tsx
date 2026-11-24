'use client'

import React, { useState } from 'react'

type Result = {
  pincode: string
  serviceable: boolean
  codAvailable: boolean
  etaDays?: { min: number; max: number }
  city?: string
}

export function DeliveryCheck({ weightGrams, codAllowed }: { weightGrams: number; codAllowed: boolean }) {
  const [pincode, setPincode] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = async (e: React.FormEvent) => {
    e.preventDefault()
    setResult(null)
    if (!/^[0-9]{6}$/.test(pincode)) {
      setError('Enter a valid 6-digit pincode')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/serviceability?pincode=${pincode}&weight=${weightGrams}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('bad response')
      setResult({ pincode, ...((await res.json()) as Omit<Result, 'pincode'>) })
    } catch {
      setError('Could not check delivery right now. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  let message: string | null = null
  if (result) {
    if (!result.serviceable) {
      message = `Sorry, we can't deliver to ${result.pincode} yet`
    } else {
      const days = result.etaDays ? ` in ${result.etaDays.min}–${result.etaDays.max} days` : ''
      const cod = result.codAvailable && codAllowed ? 'COD available' : 'Prepaid only'
      message = `Delivers to ${result.city ?? result.pincode}${days} · ${cod}`
    }
  }

  return (
    <form onSubmit={check} noValidate className="rounded-[18px] border-[3px] border-ink bg-white p-4 shadow-pop-sm">
      <label htmlFor="pincode" className="mb-2 block text-[15px] font-bold">
        Pincode
      </label>
      <div className="flex gap-2">
        <input
          id="pincode"
          name="pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="Enter pincode"
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
          className="min-w-0 flex-1 rounded-xl border-[2.5px] border-ink bg-butter px-3.5 py-2.5 text-base text-ink placeholder:text-softer"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl border-[3px] border-ink bg-ink px-5 py-2.5 text-base font-bold text-butter disabled:opacity-60"
        >
          Check
        </button>
      </div>
      <p role="status" aria-live="polite" className={`mt-2.5 min-h-5 text-[15px] font-bold ${error ? 'text-tomato-deep' : ''}`}>
        {error ?? message}
      </p>
    </form>
  )
}
