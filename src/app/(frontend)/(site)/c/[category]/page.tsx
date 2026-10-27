import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { ListingHeader } from '@/components/listing/ListingHeader'
import { ProductsGrid } from '@/components/listing/ProductsGrid'
import { getCategory, listProducts } from '@/lib/data/catalog'

type Params = Promise<{ category: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const category = await getCategory((await params).category)
  return { title: category ? `${category.title} | Reyan Collections` : 'Not found' }
}

export default async function CategoryPage({ params }: { params: Params }) {
  const slug = (await params).category
  const category = await getCategory(slug)
  if (!category) notFound()
  const products = await listProducts({ categorySlug: slug })

  return (
    <section className="px-[18px] pt-6 pb-4 md:px-12 md:pt-10">
      <ListingHeader title={category.title} description={category.description} count={products.length} />
      {products.length === 0 ? <p className="font-bold">No products here yet.</p> : <ProductsGrid products={products} />}
    </section>
  )
}
