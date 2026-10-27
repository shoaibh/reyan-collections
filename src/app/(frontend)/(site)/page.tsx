import React from 'react'

import { CategoryTiles } from '@/components/home/CategoryTiles'
import { Hero } from '@/components/home/Hero'
import { ProductGrid } from '@/components/home/ProductGrid'
import { TrustRow } from '@/components/home/TrustRow'
import { WhyDirect, type Marketplace } from '@/components/home/WhyDirect'
import { getCurated, listCategories, listProducts } from '@/lib/data/catalog'
import { getHomepage, getStoreSettings } from '@/lib/data/globals'
import { absoluteUrl, organizationJsonLd, serializeJsonLd } from '@/lib/seo'
import type { Product } from '@/payload-types'

export default async function HomePage() {
  const [homepage, settings, categories, allProducts] = await Promise.all([
    getHomepage(),
    getStoreSettings(),
    listCategories(),
    listProducts(),
  ])

  const favourites = homepage.favouritesCollection
  const slug = typeof favourites === 'object' && favourites ? favourites.slug : null
  const curated = slug ? await getCurated(slug) : null
  // Unpublished products come back as bare ids, so keep populated ones only
  const favouriteProducts = (curated?.products ?? []).filter((p): p is Product => typeof p === 'object')

  const social = settings.social
  const marketplaces: Marketplace[] = [
    { label: 'Amazon', href: social?.amazonStoreUrl?.trim() },
    { label: 'Flipkart', href: social?.flipkartStoreUrl?.trim() },
    { label: 'Meesho', href: social?.meeshoStoreUrl?.trim() },
  ].filter((m): m is Marketplace => Boolean(m.href))

  const jsonLd = serializeJsonLd(organizationJsonLd(settings, absoluteUrl('/')))

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <Hero hero={homepage.hero} ratings={social?.ratings} />
      <TrustRow returnWindowDays={settings.commerce?.returnWindowDays ?? 7} />
      <CategoryTiles categories={categories} />
      <ProductGrid
        title="This week's favourites"
        products={favouriteProducts}
        total={allProducts.length}
      />
      <WhyDirect marketplaces={marketplaces} />
    </>
  )
}
