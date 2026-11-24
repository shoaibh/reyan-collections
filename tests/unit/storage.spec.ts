import { describe, expect, it } from 'vitest'

import { r2FileUrl, storagePlugins } from '@/lib/storage'

const r2 = {
  MEDIA_STORAGE: 'r2',
  R2_BUCKET: 'test-bucket',
  R2_ENDPOINT: 'https://test-account.r2.example.com',
  R2_ACCESS_KEY_ID: 'test-key-id',
  R2_SECRET_ACCESS_KEY: 'test-key-secret',
  R2_PUBLIC_URL: 'https://media.reyancollection.in',
}

describe('storagePlugins', () => {
  it('returns no plugins for local storage', () => {
    expect(storagePlugins({})).toEqual([])
    expect(storagePlugins({ MEDIA_STORAGE: 'local' })).toEqual([])
  })

  it('throws naming every missing R2 variable', () => {
    expect(() => storagePlugins({ MEDIA_STORAGE: 'r2' })).toThrow(
      /R2_BUCKET.*R2_ENDPOINT.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*R2_PUBLIC_URL/,
    )
    expect(() => storagePlugins({ ...r2, R2_PUBLIC_URL: '' })).toThrow('R2_PUBLIC_URL')
  })

  it('returns the plugin when R2 is fully configured', () => {
    expect(storagePlugins(r2)).toHaveLength(1)
  })
})

describe('r2FileUrl', () => {
  it('joins without a double slash and encodes the filename', () => {
    expect(r2FileUrl('https://media.reyancollection.in/', 'media', 'a b.webp')).toBe(
      'https://media.reyancollection.in/media/a%20b.webp',
    )
  })

  it('works without a trailing slash or a prefix', () => {
    expect(r2FileUrl('https://media.reyancollection.in', undefined, 'a.webp')).toBe(
      'https://media.reyancollection.in/a.webp',
    )
  })
})
