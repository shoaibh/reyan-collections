import { APIError } from 'payload'
import type { CollectionConfig, ImageSize } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { revalidate } from '../lib/revalidate'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

// Every storefront tag whose cached data can embed a media doc (image src/alt)
const MEDIA_TAGS = [
  'products',
  'categories',
  'curated',
  'pages',
  'global:homepage',
  'global:navigation',
  'global:links-page',
  'global:store-settings',
]

const size = (name: string, width: number, height?: number): ImageSize => ({
  name,
  width,
  height,
  position: 'centre',
  formatOptions: { format: 'webp', options: { quality: 82 } },
})

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      ({ doc }) => {
        revalidate(MEDIA_TAGS)
        return doc
      },
    ],
    afterDelete: [
      ({ doc }) => {
        revalidate(MEDIA_TAGS)
        return doc
      },
    ],
    beforeOperation: [
      ({ req, operation }) => {
        if (operation !== 'create' && operation !== 'update') return
        const file = req.file
        if (!file) return
        const ext = file.name?.split('.').pop()?.toLowerCase() ?? ''
        const mimeOk = !file.mimetype || ALLOWED_MIME_TYPES.includes(file.mimetype)
        if (!mimeOk || !ALLOWED_EXTENSIONS.includes(ext)) {
          throw new APIError(
            'Upload JPG, PNG or WebP images (iPhone HEIC photos must be converted first)',
            400,
          )
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    mimeTypes: ALLOWED_MIME_TYPES,
    focalPoint: true,
    imageSizes: [
      size('thumb', 400, 400),
      size('card', 800, 800),
      size('hero', 1200, 1200),
      size('wide', 1600, undefined),
      size('og', 1200, 630),
    ],
  },
}
