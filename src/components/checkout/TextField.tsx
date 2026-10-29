import React from 'react'

export const inputClass =
  'w-full min-w-0 rounded-xl border-[2.5px] border-ink bg-butter px-3.5 py-3 text-base text-ink placeholder:text-softer'
export const errorClass = 'mt-1.5 text-[15px] font-bold text-[#b3261e]'
export const labelClass = 'mb-1.5 block text-[15px] font-bold'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'onChange' | 'value'> & {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  /** Helper content under the input, read with the field (the delivery message) */
  note?: React.ReactNode
}

/** A labelled input whose error and note are tied to it with aria-describedby. */
export function TextField({ id, label, value, onChange, error, note, ...rest }: Props) {
  const describedBy = [error ? `${id}-error` : null, note ? `${id}-note` : null].filter(Boolean).join(' ')
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        {...rest}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={inputClass}
      />
      {error ? (
        <p id={`${id}-error`} className={errorClass}>
          {error}
        </p>
      ) : null}
      {note ? (
        <div id={`${id}-note`} role="status" aria-live="polite" className="mt-1.5 text-[15px] font-bold">
          {note}
        </div>
      ) : null}
    </div>
  )
}
