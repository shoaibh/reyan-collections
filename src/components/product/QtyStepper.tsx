'use client'

import React from 'react'

const btn =
  'grid size-11 place-items-center rounded-xl border-[3px] border-ink bg-white text-xl leading-none font-extrabold disabled:opacity-40'

export function QtyStepper({
  value,
  max,
  onChange,
}: {
  value: number
  max: number
  onChange: (qty: number) => void
}) {
  return (
    <div role="group" aria-label="Quantity" className="flex items-center gap-3">
      <button type="button" aria-label="Decrease quantity" disabled={value <= 1} onClick={() => onChange(value - 1)} className={btn}>
        −
      </button>
      <output aria-live="polite" className="min-w-8 text-center text-xl font-extrabold">
        {value}
      </output>
      <button type="button" aria-label="Increase quantity" disabled={value >= max} onClick={() => onChange(value + 1)} className={btn}>
        +
      </button>
    </div>
  )
}
