import type { Homepage, LinksPage, Navigation, StoreSetting } from '@/payload-types'

import { cached } from './cache'
import { getClient } from './getPayloadClient'

export const getHomepage = cached<Homepage>(
  async () => {
    const payload = await getClient()
    return payload.findGlobal({ slug: 'homepage', depth: 2, draft: false, overrideAccess: false })
  },
  ['global', 'homepage'],
  ['global:homepage', 'products', 'curated'],
)

export const getNavigation = cached<Navigation>(
  async () => {
    const payload = await getClient()
    return payload.findGlobal({ slug: 'navigation', depth: 1, overrideAccess: false })
  },
  ['global', 'navigation'],
  ['global:navigation', 'categories', 'curated', 'pages'],
)

export const getLinksPage = cached<LinksPage>(
  async () => {
    const payload = await getClient()
    return payload.findGlobal({ slug: 'links-page', depth: 1, overrideAccess: false })
  },
  ['global', 'links-page'],
  ['global:links-page'],
)

export const getStoreSettings = cached<StoreSetting>(
  async () => {
    const payload = await getClient()
    return payload.findGlobal({ slug: 'store-settings', depth: 1, overrideAccess: false })
  },
  ['global', 'store-settings'],
  ['global:store-settings'],
)
