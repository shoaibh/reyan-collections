import { getPayload } from 'payload'

import config from '@/payload.config'

import { assertSeedAllowed } from './guard'
import { seed } from './index'

// `payload run` imports this file, so the work must finish via top-level await.
try {
  assertSeedAllowed(process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
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
