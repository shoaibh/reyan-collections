import Link from 'next/link'
import React from 'react'

import { ProductCard } from '@/components/product/ProductCard'
import type { Product } from '@/payload-types'

export function ProductGrid({
  title,
  products,
  total,
}: {
  title: string
  products: Product[]
  total: number
}) {
  if (products.length === 0) return null
  return (
    <section aria-labelledby="fav-h" className="px-[18px] pt-10 md:px-12 md:pt-16">
      <div className="mb-4 flex items-end justify-between md:mb-6">
        <h2 id="fav-h" className="mr-3 text-[30px] font-extrabold tracking-[-0.04em] md:text-[46px]">
          {title}
        </h2>
        <Link href="/shop" className="shrink-0 whitespace-nowrap border-b-[3px] border-tomato text-[13px] font-bold md:text-base">
          See all {total} →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-[22px]">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  )
}
