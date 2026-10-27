'use client'

import Image from 'next/image'
import React from 'react'

import type { CartLineInfo } from '@/app/(frontend)/api/cart-lines/route'
import { QtyStepper } from '@/components/product/QtyStepper'
import { formatINR } from '@/lib/format'

/** The quantity a line can actually hold right now: live stock, then the per-order cap. */
export const effectiveQty = (qty: number, stock: number, maxPerOrder: number) =>
  Math.max(0, Math.min(qty, stock, maxPerOrder))

export function CartLineItem({
  info,
  qty,
  maxPerOrder,
  onQty,
  onRemove,
  onNavigate,
}: {
  info: CartLineInfo
  qty: number
  maxPerOrder: number
  onQty: (qty: number) => void
  onRemove: () => void
  onNavigate?: () => void
}) {
  const remove = (label: string) => (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label}`}
      className="self-start rounded-lg border-2 border-ink bg-white px-3 py-1.5 text-sm font-bold text-ink"
    >
      Remove
    </button>
  )

  if (!info.available || info.title === null || info.price === null) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-2xl border-[3px] border-dashed border-ink bg-white p-3">
        <p className="font-bold text-softer">No longer available</p>
        {remove('unavailable item')}
      </li>
    )
  }

  const name = info.variantName && info.variantName !== 'Default' ? `${info.title} — ${info.variantName}` : info.title
  const shown = effectiveQty(qty, info.stock, maxPerOrder)
  const max = Math.min(info.stock, maxPerOrder)
  const clamped = qty > shown

  return (
    <li className="flex flex-col gap-2 rounded-2xl border-[3px] border-ink bg-white p-3">
      <div className="flex gap-3">
        {info.image ? (
          <Image
            src={info.image}
            alt=""
            width={72}
            height={72}
            className="size-[72px] shrink-0 rounded-xl border-2 border-ink object-cover"
          />
        ) : (
          <div className="size-[72px] shrink-0 rounded-xl border-2 border-ink bg-butter" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {info.slug ? (
            <a href={`/p/${info.slug}`} onClick={onNavigate} className="font-bold leading-snug underline-offset-2 hover:underline">
              {name}
            </a>
          ) : (
            <p className="font-bold leading-snug">{name}</p>
          )}
          <p className="text-sm text-softer">{formatINR(info.price)} each</p>
        </div>
      </div>
      {clamped && (
        <p role="status" className="rounded-lg border-2 border-ink bg-sun px-2.5 py-1 text-sm font-bold text-ink">
          Only {info.stock} left; we updated your quantity
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <QtyStepper value={shown} max={max} onChange={onQty} />
        <p className="text-lg font-extrabold">{formatINR(info.price * shown)}</p>
      </div>
      {remove(name)}
    </li>
  )
}
