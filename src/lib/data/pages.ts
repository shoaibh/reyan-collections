import type { Page } from '@/payload-types'

import { cached } from './cache'
import { getClient } from './getPayloadClient'

export const getPage = (slug: string): Promise<Page | null> =>
  cached(
    async () => {
      const payload = await getClient()
      const { docs } = await payload.find({
        collection: 'pages',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 1,
        draft: false,
        overrideAccess: false,
      })
      return docs[0] ?? null
    },
    ['page', slug],
    ['pages', `page:${slug}`],
  )()

export const listPageSlugs = cached<string[]>(
  async () => {
    const payload = await getClient()
    const { docs } = await payload.find({
      collection: 'pages',
      limit: 1000,
      depth: 0,
      pagination: false,
      draft: false,
      overrideAccess: false,
    })
    return docs.map((d) => d.slug).filter((s): s is string => typeof s === 'string')
  },
  ['pages', 'slugs'],
  ['pages'],
)
