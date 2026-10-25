import { s3Storage } from '@payloadcms/storage-s3'
import type { Plugin } from 'payload'

export function storagePlugins(): Plugin[] {
  if (process.env.MEDIA_STORAGE !== 'r2') return []

  return [
    s3Storage({
      collections: { media: { prefix: 'media' } },
      bucket: process.env.R2_BUCKET || '',
      config: {
        endpoint: process.env.R2_ENDPOINT,
        region: 'auto',
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  ]
}
