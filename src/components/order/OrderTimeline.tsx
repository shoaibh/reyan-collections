import React from 'react'

const STEPS = ['Placed', 'Confirmed', 'Shipped', 'Delivered']

export function OrderTimeline({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
      {STEPS.map((label, i) => {
        const done = i <= step
        return (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-ink text-base font-extrabold ${
                done ? 'bg-sun text-ink' : 'bg-white text-softer'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`text-[14px] ${i === step ? 'font-extrabold' : 'font-bold text-soft'}`}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
