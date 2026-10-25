// @vitest-environment node
import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

let payload: Payload
const createdIds: (number | string)[] = []

describe('Media collection', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await payload.delete({ collection: 'media', id }).catch(() => undefined)
    }
  })

  it('generates webp sizes cropped to spec', async () => {
    const doc = await payload.create({
      collection: 'media',
      data: { alt: 'sample' },
      filePath: 'tests/fixtures/sample.jpg',
    })
    createdIds.push(doc.id)

    expect(doc.sizes?.card?.width).toBe(800)
    expect(doc.sizes?.card?.height).toBe(800)
    expect(doc.sizes?.og?.height).toBe(630)
    expect(doc.sizes?.card?.mimeType).toBe('image/webp')
  })

  it('requires alt text', async () => {
    await expect(
      payload.create({
        collection: 'media',
        data: {} as { alt: string },
        filePath: 'tests/fixtures/sample.jpg',
      }),
    ).rejects.toThrow(/alt/i)
  })

  it('rejects HEIC with a clear message', async () => {
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'heic' },
        filePath: 'tests/fixtures/sample.heic',
      }),
    ).rejects.toThrow(/JPG, PNG or WebP/)
  })
})
