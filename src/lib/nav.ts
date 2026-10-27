import type { Navigation } from '@/payload-types'

export type NavLink = { label: string; href: string }

/** Resolves navigation items to hrefs, skipping items whose relation is missing or unpublished (returned as a bare id). */
export function resolveNavLinks(items: Navigation['items']): NavLink[] {
  const links: NavLink[] = []
  for (const item of items ?? []) {
    let href: string | undefined
    if (item.linkType === 'shop') href = '/shop'
    else if (item.linkType === 'category' && typeof item.category === 'object' && item.category)
      href = `/c/${item.category.slug}`
    else if (item.linkType === 'collection' && typeof item.collection === 'object' && item.collection)
      href = `/collections/${item.collection.slug}`
    else if (item.linkType === 'page' && typeof item.page === 'object' && item.page) href = `/${item.page.slug}`
    if (href) links.push({ label: item.label, href })
  }
  return links
}
