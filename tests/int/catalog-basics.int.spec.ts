import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { slugify } from '@/fields/slug'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
const created: { collection: 'categories' | 'pages'; id: number | string }[] = []

describe('Catalog basics', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  afterAll(async () => {
    for (const { collection, id } of created) {
      await payload.delete({ collection, id, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('slugifies symbols', () => {
    expect(slugify('Toys & Games')).toBe('toys-and-games')
  })

  it('never produces an empty slug', () => {
    expect(slugify('खिलौने')).toMatch(/^item-[a-z0-9]{6}$/)
  })

  it('fills and rejects duplicate category slugs', async () => {
    const first = await payload.create({
      collection: 'categories',
      data: { title: 'Toys & Games', tileColor: 'cobalt' },
      overrideAccess: true,
    })
    created.push({ collection: 'categories', id: first.id })

    expect(first.slug).toBe('toys-and-games')

    await expect(
      payload.create({
        collection: 'categories',
        data: { title: 'Toys and Games', slug: 'toys-and-games', tileColor: 'mint' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('hides draft pages from the public', async () => {
    const draft = await payload.create({
      collection: 'pages',
      data: { title: 'Catalog Draft Page' },
      draft: true,
      overrideAccess: true,
    })
    created.push({ collection: 'pages', id: draft.id })

    const published = await payload.create({
      collection: 'pages',
      data: { title: 'Catalog Published Page', _status: 'published' },
      overrideAccess: true,
    })
    created.push({ collection: 'pages', id: published.id })

    const publicView = await payload.find({
      collection: 'pages',
      overrideAccess: false,
    })
    const ids = publicView.docs.map((doc) => doc.id)

    expect(ids).toContain(published.id)
    expect(ids).not.toContain(draft.id)
  })
})
