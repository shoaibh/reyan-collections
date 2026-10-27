import type { MetadataRoute } from 'next'

import { listCategories, listCuratedSlugs, listProducts } from '@/lib/data/catalog'
import { listPageSlugs } from '@/lib/data/pages'
import { absoluteUrl } from '@/lib/seo'

// Products and pages change in the admin; a build-time snapshot would go stale until the next deploy
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, collections, pages] = await Promise.all([
    listProducts(),
    listCategories(),
    listCuratedSlugs(),
    listPageSlugs(),
  ])

  const staticPaths = ['/', '/shop', '/links']
  return [
    ...staticPaths.map((path) => ({ url: absoluteUrl(path) })),
    ...products.flatMap((p) =>
      p.slug ? [{ url: absoluteUrl(`/p/${p.slug}`), lastModified: new Date(p.updatedAt) }] : [],
    ),
    ...categories.flatMap((c) => (c.slug ? [{ url: absoluteUrl(`/c/${c.slug}`) }] : [])),
    ...collections.map((slug) => ({ url: absoluteUrl(`/collections/${slug}`) })),
    ...pages.map((slug) => ({ url: absoluteUrl(`/${slug}`) })),
  ]
}
