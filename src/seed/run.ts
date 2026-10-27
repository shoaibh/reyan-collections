import { existsSync, rmSync } from 'node:fs'

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
  // Seeding runs outside Next, so revalidation hooks no-op; drop the persisted data cache instead
  let cleared = false
  for (const dir of ['.next/cache/fetch-cache', '.next/dev/cache/fetch-cache']) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
      cleared = true
    }
  }
  if (cleared) console.log('Cleared storefront cache')
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
