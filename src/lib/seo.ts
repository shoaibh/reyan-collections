import type { Media, Product, StoreSetting } from '@/payload-types'

import { resolveImage } from './media'

export const BRAND = 'Reyan Collections'
export const DEFAULT_SITE_URL = 'http://localhost:3000'

/** Public origin of the site, without a trailing slash. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SERVER_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
}

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string, base: string = siteUrl()): string {
  return new URL(path, `${base}/`).toString()
}

/**
 * Serialises JSON-LD for a `<script type="application/ld+json">`. `<` is escaped so admin-entered
 * text such as a product title cannot close the script tag.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function productJsonLd(p: Product, url: string) {
  const origin = new URL(url).origin
  const images = (p.images ?? [])
    .filter((m): m is Media => typeof m === 'object' && m !== null)
    .flatMap((m) => {
      const img = resolveImage(m, 'hero', p.title)
      return img ? [absoluteUrl(img.src, origin)] : []
    })
  const stock = (p.variants ?? []).reduce((sum, v) => sum + (v.stock ?? 0), 0)
  const description = p.seo?.description?.trim() || p.shortDescription?.trim() || undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    image: images,
    description,
    brand: { '@type': 'Brand', name: BRAND },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: p.price,
      availability: stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url,
    },
  }
}

export function organizationJsonLd(settings: StoreSetting, url: string) {
  const social = settings.social
  const sameAs = [
    social?.instagramUrl,
    social?.amazonStoreUrl,
    social?.flipkartStoreUrl,
    social?.meeshoStoreUrl,
  ]
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u))

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings.business?.name?.trim() || BRAND,
    url,
    logo: absoluteUrl('/brand/logo-circle.jpg', new URL(url).origin),
    email: settings.business?.email?.trim() || undefined,
    telephone: settings.business?.phone?.trim() || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  }
}
