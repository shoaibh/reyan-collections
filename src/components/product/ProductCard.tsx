import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { formatINR } from '@/lib/format'
import { resolveImage } from '@/lib/media'
import { showComparison } from '@/lib/commerce/product'
import type { Product } from '@/payload-types'

const badgeLabel = { bestseller: 'Bestseller!', new: 'New!', limited: 'Limited' } as const
const marketplaceLabel = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho' } as const

export function ProductCard({ product }: { product: Product }) {
  const image = resolveImage(product.images?.[0], 'card', product.title)
  const compare = showComparison(product) ? product.compareAt : null
  const saving = compare?.price ? compare.price - product.price : 0
  const badge = product.badge && product.badge !== 'none' ? badgeLabel[product.badge] : null
  const soldOut = product.variants.length > 0 && product.variants.every((v) => v.stock <= 0)

  return (
    <Link href={`/p/${product.slug}`} className="block rounded-[18px] md:rounded-[22px]">
      <article
        data-testid="product-card"
        className="h-full rounded-[18px] border-[3px] border-ink bg-white p-2 shadow-[4px_4px_0_var(--color-ink)] md:rounded-[22px] md:p-3 md:shadow-pop"
      >
        <div className="relative aspect-square overflow-hidden rounded-xl border-2 border-ink bg-butter md:rounded-[14px]">
          {image && (
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 768px) 25vw, 50vw"
              className="object-cover"
            />
          )}
          {saving > 0 && (
            <span className="absolute top-2 left-2 -rotate-[4deg] rounded-full border-2 border-ink bg-sun px-[7px] py-[3px] text-[10.5px] font-extrabold md:px-2.5 md:py-1 md:text-[13px]">
              Save {formatINR(saving)}
            </span>
          )}
          {badge && (
            <span className="absolute top-2 right-2 rotate-[6deg] rounded-full border-2 border-ink bg-pink px-[7px] py-[3px] text-[10.5px] font-extrabold md:px-2.5 md:py-1 md:text-[13px]">
              {badge}
            </span>
          )}
          {soldOut && (
            <span className="absolute inset-x-0 bottom-0 bg-ink py-1 text-center text-xs font-bold text-butter">
              Out of stock
            </span>
          )}
        </div>
        <h3 className="mx-0.5 mt-2.5 mb-1 min-h-[34px] text-[13.5px] leading-tight font-bold md:mx-1 md:mt-3.5 md:min-h-[42px] md:text-[17px]">
          {product.title}
        </h3>
        <div className="mx-0.5 mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 md:mx-1 md:mb-3.5">
          <b className="text-lg font-extrabold md:text-[23px]">{formatINR(product.price)}</b>
          {compare?.price && (
            <s className="text-[10.5px] text-softer md:text-[13px]">
              {formatINR(compare.price)} on {compare.marketplace ? marketplaceLabel[compare.marketplace] : 'Amazon'}
            </s>
          )}
        </div>
        <span className="block rounded-[10px] bg-ink p-[9px] text-center text-[13px] font-bold text-butter md:rounded-xl md:p-[11px] md:text-[15px]">
          View
        </span>
      </article>
    </Link>
  )
}
