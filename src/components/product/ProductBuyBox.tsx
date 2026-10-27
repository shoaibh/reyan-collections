'use client'

import React, { useMemo, useState } from 'react'

import { useCart } from '@/components/cart/CartProvider'
import { DeliveryCheck } from '@/components/product/DeliveryCheck'
import { Gallery, type GalleryImage } from '@/components/product/Gallery'
import { QtyStepper } from '@/components/product/QtyStepper'
import { StockState, useLiveStock } from '@/components/product/StockState'
import { VariantPicker, type VariantOption } from '@/components/product/VariantPicker'
import { buildWhatsAppLink } from '@/lib/whatsapp'

export type BuyBoxVariant = VariantOption & { stock: number; images: GalleryImage[] }

export function ProductBuyBox({
  productId,
  title,
  variants,
  productImages,
  maxPerOrder,
  weightGrams,
  codAllowed,
  whatsappNumber,
  header,
}: {
  productId: number
  title: string
  variants: BuyBoxVariant[]
  productImages: GalleryImage[]
  maxPerOrder: number
  weightGrams: number
  codAllowed: boolean
  whatsappNumber?: string | null
  /** Server-rendered title, price and badges, shown above the controls */
  header: React.ReactNode
}) {
  const cart = useCart()
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? '')
  const [wanted, setWanted] = useState(1)

  const serverStock = useMemo(() => Object.fromEntries(variants.map((v) => [v.id, v.stock])), [variants])
  const stock = useLiveStock(productId, serverStock)

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0]
  if (!selected) return null

  const available = stock[selected.id] ?? 0
  const outOfStock = available <= 0
  const max = Math.max(0, Math.min(available, maxPerOrder))
  const qty = Math.max(1, Math.min(wanted, max))

  // The selected variant's images come first, then the product's own (without repeats)
  const gallery = [...selected.images, ...productImages].filter(
    (img, i, all) => all.findIndex((o) => o.src === img.src) === i,
  )

  const askLabel = `${title}${variants.length > 1 ? ` (${selected.name})` : ''}`

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-12">
      <Gallery key={selected.id} images={gallery} />
      <div className="flex flex-col gap-5">
        {header}
        <VariantPicker variants={variants} selectedId={selected.id} onSelect={setSelectedId} />
        <StockState stock={available} />
        {!outOfStock && <QtyStepper value={qty} max={max} onChange={setWanted} />}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={outOfStock}
            onClick={() => {
              cart.add({ productId, variantId: selected.id, qty })
              cart.setOpen(true)
            }}
            className="rounded-2xl border-[3px] border-ink bg-cobalt px-6 py-3.5 text-[19px] font-extrabold text-white shadow-[4px_4px_0_var(--color-ink)] transition-transform enabled:hover:-translate-y-0.5 disabled:bg-white disabled:text-softer disabled:shadow-none md:shadow-pop"
          >
            Add to cart
          </button>
          {outOfStock && whatsappNumber && (
            <a
              href={buildWhatsAppLink(whatsappNumber, `Hi Reyan Collections, is ${askLabel} coming back in stock?`)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border-[3px] border-ink bg-mint px-6 py-3 text-center text-[17px] font-extrabold text-ink shadow-[4px_4px_0_var(--color-ink)]"
            >
              Ask on WhatsApp
            </a>
          )}
        </div>
        <DeliveryCheck weightGrams={weightGrams} codAllowed={codAllowed} />
      </div>
    </div>
  )
}
