'use client'

import React, { useState } from 'react'

const input =
  'w-full rounded-xl border-[2.5px] border-ink bg-butter px-3.5 py-2.5 text-base text-ink placeholder:text-softer'

export function TrackForm() {
  const [orderNumber, setOrderNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ orderNumber, phone }),
      })
      const json = (await res.json()) as { url?: string; error?: string }
      if (res.ok && json.url) {
        window.location.assign(json.url)
        return
      }
      setError(json.error ?? 'Something went wrong. Please try again.')
    } catch {
      setError('Could not look up your order right now. Please try again.')
    }
    setBusy(false)
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-[18px] border-[3px] border-ink bg-white p-4 shadow-pop-sm"
    >
      <div>
        <label htmlFor="orderNumber" className="mb-2 block text-[15px] font-bold">
          Order number
        </label>
        <input
          id="orderNumber"
          name="orderNumber"
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="RC1001"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="phone" className="mb-2 block text-[15px] font-bold">
          Mobile number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={input}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-2xl border-[3px] border-ink bg-cobalt px-6 py-3.5 text-center text-[19px] font-extrabold text-white shadow-[4px_4px_0_var(--color-ink)] disabled:opacity-60"
      >
        Find my order
      </button>
      <p role="alert" className="min-h-5 text-[15px] font-bold text-tomato-deep">
        {error}
      </p>
    </form>
  )
}
