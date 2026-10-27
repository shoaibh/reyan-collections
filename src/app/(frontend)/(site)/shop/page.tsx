import type { Metadata } from 'next'
import Link from 'next/link'
import React, { Suspense } from 'react'

import { ListingHeader } from '@/components/listing/ListingHeader'
import { ProductsGrid } from '@/components/listing/ProductsGrid'
import { SortSelect } from '@/components/listing/SortSelect'
import { listCategories, listProducts, normaliseQuery, type ProductSort } from '@/lib/data/catalog'

type SearchParams = Promise<{ q?: string; category?: string; sort?: string }>

const sorts: ProductSort[] = ['featured', 'price-asc', 'price-desc']
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = normaliseQuery(one((await searchParams).q))
  return { title: q ? `Results for "${q}" | Reyan Collections` : 'Shop all | Reyan Collections' }
}

const chip =
  'rounded-full border-[2.5px] border-ink px-3.5 py-1.5 text-[13px] font-bold whitespace-nowrap md:text-[15px]'

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = normaliseQuery(one(sp.q)) || undefined
  const category = one(sp.category) || undefined
  const sort = sorts.find((s) => s === one(sp.sort)) ?? 'featured'

  const [products, categories] = await Promise.all([
    listProducts({ categorySlug: category, q, sort }),
    listCategories(),
  ])

  const href = (cat?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (cat) params.set('category', cat)
    if (sort !== 'featured') params.set('sort', sort)
    const qs = params.toString()
    return qs ? `/shop?${qs}` : '/shop'
  }

  return (
    <section className="px-[18px] pt-6 pb-4 md:px-12 md:pt-10">
      <ListingHeader title={q ? `Results for "${q}"` : 'Shop all'} count={products.length} />

      <form action="/shop" method="get" role="search" className="mb-4 md:hidden">
        <input
          type="search"
          maxLength={80}
          name="q"
          defaultValue={q}
          placeholder="Search products…"
          aria-label="Search products"
          className="w-full rounded-full border-[2.5px] border-ink bg-white px-[18px] py-2.5 text-sm text-ink placeholder:text-softer"
        />
        {category && <input type="hidden" name="category" value={category} />}
      </form>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
          <Link href={href()} aria-current={!category ? 'true' : undefined} className={`${chip} ${!category ? 'bg-ink text-butter' : 'bg-white'}`}>
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={href(c.slug ?? undefined)}
              aria-current={category === c.slug ? 'true' : undefined}
              className={`${chip} ${category === c.slug ? 'bg-ink text-butter' : 'bg-white'}`}
            >
              {c.title}
            </Link>
          ))}
        </nav>
        <Suspense>
          <SortSelect value={sort} />
        </Suspense>
      </div>

      {products.length === 0 ? (
        <div className="rounded-[20px] border-[3px] border-ink bg-white p-6 text-center shadow-pop-sm">
          <p className="mb-3 text-lg font-bold">{q ? `No products match "${q}"` : 'No products found'}</p>
          <Link href="/shop" className="border-b-[3px] border-tomato font-bold">
            See all products
          </Link>
        </div>
      ) : (
        <ProductsGrid products={products} />
      )}
    </section>
  )
}
