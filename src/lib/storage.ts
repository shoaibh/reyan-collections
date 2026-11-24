import { s3Storage } from '@payloadcms/storage-s3'
import type { Plugin } from 'payload'

import { R2_KEYS, type Env } from './env'

/** Public URL of a file in the media bucket: no double slash, filename encoded. */
export function r2FileUrl(publicUrl: string, prefix: string | undefined, filename: string): string {
  const base = publicUrl.replace(/\/+$/, '')
  const path = [prefix, filename].filter(Boolean).map((part) => encodeURIComponent(part as string))
  return `${base}/${path.join('/')}`
}

export function storagePlugins(env: Env = process.env): Plugin[] {
  if (env.MEDIA_STORAGE !== 'r2') return []

  const missing = R2_KEYS.filter((name) => !env[name])
  if (missing.length) throw new Error(`MEDIA_STORAGE=r2 needs ${missing.join(', ')}`)

  const publicUrl = env.R2_PUBLIC_URL as string

  return [
    s3Storage({
      // Product photos are public, so they are served straight from the bucket's domain, not through the app
      collections: {
        media: {
          prefix: 'media',
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) => r2FileUrl(publicUrl, prefix, filename),
        },
      },
      bucket: env.R2_BUCKET as string,
      config: {
        endpoint: env.R2_ENDPOINT,
        region: 'auto',
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID as string,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
        },
      },
    }),
  ]
}
