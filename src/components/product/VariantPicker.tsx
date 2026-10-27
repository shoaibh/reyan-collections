'use client'

import React from 'react'

export type VariantOption = { id: string; name: string; swatch?: string | null }

/** Colour swatches. Hidden when there is only one variant. */
export function VariantPicker({
  variants,
  selectedId,
  onSelect,
}: {
  variants: VariantOption[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  if (variants.length <= 1) return null
  const selected = variants.find((v) => v.id === selectedId)

  return (
    <div>
      <p className="mb-2 text-[15px] font-bold">Colour: {selected?.name}</p>
      <div className="flex flex-wrap gap-3">
        {variants.map((v) => {
          const isSelected = v.id === selectedId
          return (
            <button
              key={v.id}
              type="button"
              aria-label={v.name}
              aria-pressed={isSelected}
              onClick={() => onSelect(v.id)}
              style={v.swatch ? { backgroundColor: v.swatch } : undefined}
              className={`grid size-11 place-items-center rounded-full text-[11px] font-extrabold text-ink ${
                v.swatch ? '' : 'bg-white'
              } ${
                isSelected
                  ? 'border-[4px] border-ink shadow-[3px_3px_0_var(--color-ink)]'
                  : 'border-2 border-ink'
              }`}
            >
              {v.swatch ? null : v.name.slice(0, 2)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
