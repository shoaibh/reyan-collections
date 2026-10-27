import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

import { testDbUri } from '../helpers/testDbUri'

const TEST_DATABASE_URI = testDbUri()

/**
 * Resets the test database and seeds it through Payload's local API (`pnpm seed`).
 * DATABASE_URI is passed explicitly so the value in .env never wins.
 */
export default async function globalSetup() {
  const env = { ...process.env, DATABASE_URI: TEST_DATABASE_URI }
  // Next's data cache persists on disk across dev-server runs; entries from a previous run describe a
  // database that no longer exists, and invalidation tags live in memory only. Start every run cold.
  // (`next dev` keeps it under .next/dev/cache; `next build`/`start` under .next/cache.)
  rmSync('.next/dev/cache/fetch-cache', { recursive: true, force: true })
  rmSync('.next/cache/fetch-cache', { recursive: true, force: true })
  // The web server is started first, but its readiness URL is a static file, so it holds no DB connections yet.
  execSync('pnpm db:reset:test', { stdio: 'inherit', env })
  execSync('pnpm seed', { stdio: 'inherit', env })

  // A cold dev server compiles each route on first request (/admin alone takes ~30s because PostCSS
  // runs over Payload's admin CSS). Warm everything the specs touch so no test pays for compiling
  // inside its own timeout.
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
  const get = async (route: string, cookie?: string) => {
    const res = await fetch(`${base}${route}`, {
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) throw new Error(`Warm-up of ${route} failed with ${res.status}`)
    return res
  }

  await get('/')
  await get('/admin/login')

  const login = await fetch(`${base}/api/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    }),
    signal: AbortSignal.timeout(180_000),
  })
  if (!login.ok) throw new Error(`Warm-up login failed with ${login.status}`)
  const { token } = (await login.json()) as { token: string }
  const cookie = `payload-token=${token}`

  await get('/admin', cookie)
  await get('/admin/collections/products', cookie)
  const products = (await (await get('/api/products?limit=1&depth=0', cookie)).json()) as {
    docs: { id: number }[]
  }
  const first = products.docs[0]
  if (first) await get(`/admin/collections/products/${first.id}`, cookie)
}
