import { getPayload } from 'payload'

import config from '@/payload.config'

import { seed } from './index'

// `payload run` imports this file, so the work must finish via top-level await.
if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
  console.error('Refusing to seed in production. Set SEED_FORCE=1 to override.')
  process.exit(1)
}

try {
  const payload = await getPayload({ config: await config })
  const counts = await seed(payload)
  console.log(`Seeded ${counts.products} products and ${counts.categories} categories`)
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
