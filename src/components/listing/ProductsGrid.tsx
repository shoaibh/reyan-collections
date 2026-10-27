import React from 'react'

import { ProductCard } from '@/components/product/ProductCard'
import type { Product } from '@/payload-types'

export function ProductsGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-[22px]">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}
