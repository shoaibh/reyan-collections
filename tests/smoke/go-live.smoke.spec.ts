import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { test, expect, type APIRequestContext } from '@playwright/test'

import { addToCartAndCheckout, fillShopper } from '../e2e/helpers/checkout'

const SMOKE_DATABASE_URI = process.env.SMOKE_DATABASE_URI as string

// The upload lands in ./media (MEDIA_STORAGE=local); it is removed at the end so reruns and other suites find it clean
let cleanup: ((request: APIRequestContext) => Promise<unknown>) | undefined

test.afterEach(async ({ request }) => {
  await cleanup?.(request)
})

test('a production build boots on an empty database and takes a first COD order', async ({
  page,
  request,
  baseURL,
}) => {
  // 1. Healthy, and the boot ran the migrations on the empty database
  const health = await request.get('/api/health')
  expect(health.status()).toBe(200)
  const migrations = execFileSync(
    'psql',
    [SMOKE_DATABASE_URI, '-tAc', 'select name from payload_migrations'],
    { encoding: 'utf8' },
  )
  expect(migrations).toContain('initial')

  // 2. The origin lock: no secret header means 403, except the health check
  // (plain fetch: Playwright request contexts inherit the config's extra headers)
  expect((await fetch(`${baseURL}/`)).status).toBe(403)
  expect((await fetch(`${baseURL}/api/health`)).status).toBe(200)

  // 3. The empty storefront renders, with the CSP header
  const home = await page.goto('/')
  expect(home?.status()).toBe(200)
  expect(home?.headers()['content-security-policy']).toContain("default-src 'self'")
  await expect(page.getByRole('link', { name: /Reyan Collections?/i }).first()).toBeVisible()

  // 4. First admin, then the catalogue and settings the checkout needs, through Payload REST
  const email = 'smoke-owner@example.invalid'
  const register = await request.post('/api/users/first-register', {
    data: { email, password: 'Smoke-Owner-Pass-123', name: 'Smoke Owner' },
  })
  expect(register.ok()).toBeTruthy()
  const { token } = (await register.json()) as { token: string }
  const auth = { Authorization: `JWT ${token}` }

  const category = await request.post('/api/categories', {
    headers: auth,
    data: { title: 'Smoke toys', tileColor: 'cobalt', order: 1 },
  })
  expect(category.ok()).toBeTruthy()
  const categoryId = ((await category.json()) as { doc: { id: number } }).doc.id

  const upload = await request.post('/api/media', {
    headers: auth,
    multipart: {
      _payload: JSON.stringify({ alt: 'Smoke duck' }),
      file: { name: 'smoke-duck.jpg', mimeType: 'image/jpeg', buffer: readFileSync('tests/fixtures/sample.jpg') },
    },
  })
  expect(upload.ok()).toBeTruthy()
  const mediaId = ((await upload.json()) as { doc: { id: number } }).doc.id
  cleanup = (api) => api.delete(`/api/media/${mediaId}`, { headers: auth })

  const created = await request.post('/api/products', {
    headers: auth,
    data: {
      title: 'Smoke test duck',
      _status: 'published',
      images: [mediaId],
      price: 549,
      variants: [{ name: 'Default', stock: 5 }],
      category: categoryId,
      shortDescription: 'A duck for the smoke test.',
      tax: { hsnCode: '9503', gstRate: 12 },
      shipping: { weightGrams: 700, lengthCm: 30, widthCm: 20, heightCm: 10 },
    },
  })
  expect(created.ok()).toBeTruthy()
  const slug = ((await created.json()) as { doc: { slug: string } }).doc.slug

  const settings = await request.post('/api/globals/store-settings', {
    headers: auth,
    data: {
      business: {
        name: 'Reyan Collections',
        email: 'orders@example.invalid',
        whatsappNumber: '910000000000',
        address: { line1: '1 Smoke Street', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400001' },
      },
    },
  })
  expect(settings.ok()).toBeTruthy()

  // 5. The new product shows on /shop (production revalidation)
  await page.goto('/shop')
  await expect(page.getByText('Smoke test duck').first()).toBeVisible()

  // 6. A cash-on-delivery order, placed through the UI
  await page.goto(`/p/${slug}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Smoke test duck' })).toBeVisible()
  await addToCartAndCheckout(page)
  await fillShopper(page, {
    name: 'Ravi Kumar',
    phone: '98765 00002',
    line1: '4 Lake View',
    pincode: '400001',
    city: 'Mumbai',
    state: 'Maharashtra',
  })
  await page.getByRole('radio', { name: 'Cash on delivery' }).check()
  await page.getByRole('button', { name: 'Place order' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Order received' })).toBeVisible()
  await expect(page.getByText("We'll WhatsApp you shortly to confirm your order.")).toBeVisible()
  await expect(page.getByText(/^Order RC\d{4}/).first()).toBeVisible()
})
