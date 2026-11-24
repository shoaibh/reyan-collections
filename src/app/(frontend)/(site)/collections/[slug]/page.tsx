import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { ListingHeader } from '@/components/listing/ListingHeader'
import { ProductsGrid } from '@/components/listing/ProductsGrid'
import { getCurated } from '@/lib/data/catalog'
import type { Product } from '@/payload-types'

type Params = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const curated = await getCurated((await params).slug)
  return { title: curated ? curated.title : 'Not found' }
}

export default async function CollectionPage({ params }: { params: Params }) {
  const curated = await getCurated((await params).slug)
  if (!curated) notFound()
  // Unpublished products come back as bare ids, so keep populated ones only
  const products = (curated.products ?? []).filter((p): p is Product => typeof p === 'object')

  return (
    <section className="px-[18px] pt-6 pb-4 md:px-12 md:pt-10">
      <ListingHeader title={curated.title} description={curated.description} count={products.length} />
      {products.length === 0 ? <p className="font-bold">No products here yet.</p> : <ProductsGrid products={products} />}
    </section>
  )
}
