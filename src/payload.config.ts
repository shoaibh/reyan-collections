import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Categories } from './collections/Categories'
import { Curated } from './collections/Curated'
import { Products } from './collections/Products'
import { Pages } from './collections/Pages'
import { Homepage } from './globals/Homepage'
import { Navigation } from './globals/Navigation'
import { LinksPage } from './globals/LinksPage'
import { StoreSettings } from './globals/StoreSettings'
import { storagePlugins } from './lib/storage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    components: {
      graphics: {
        Logo: '/admin/brand/Logo',
        Icon: '/admin/brand/Icon',
      },
    },
    meta: {
      titleSuffix: '· Reyan Collections',
      icons: [{ rel: 'icon', type: 'image/png', url: '/brand/logo-mark.png' }],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Categories, Curated, Products, Pages],
  globals: [Homepage, Navigation, LinksPage, StoreSettings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  sharp,
  upload: { limits: { fileSize: 15_000_000 }, abortOnLimit: true },
  plugins: [...storagePlugins()],
})
