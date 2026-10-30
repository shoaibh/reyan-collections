import { readFileSync } from 'node:fs'
import path from 'node:path'

import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

const SLUG = 'wooden-stacking-rings'
const TITLE = 'Wooden stacking rings'
const ALT = 'Stacking rings'

let token = ''

const authHeaders = () => ({ Authorization: `JWT ${token}` })

async function login(request: APIRequestContext) {
  const res = await request.post('/api/users/login', {
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  })
  expect(res.ok()).toBeTruthy()
  token = ((await res.json()) as { token: string }).token
}

/** Removes the product and the media this spec creates (also clears leftovers of a crashed run). */
async function cleanup(request: APIRequestContext) {
  if (!token) await login(request)
  const products = await request.get(
    `/api/products?where[slug][equals]=${SLUG}&depth=0&draft=true&limit=10`,
    { headers: authHeaders() },
  )
  for (const doc of ((await products.json()) as { docs: { id: number }[] }).docs ?? []) {
    await request.delete(`/api/products/${doc.id}`, { headers: authHeaders() })
  }
  const media = await request.get(`/api/media?where[alt][equals]=${encodeURIComponent(ALT)}&depth=0&limit=20`, {
    headers: authHeaders(),
  })
  for (const doc of ((await media.json()) as { docs: { id: number }[] }).docs ?? []) {
    await request.delete(`/api/media/${doc.id}`, { headers: authHeaders() })
  }
}

test.beforeAll(async ({ request }) => {
  await cleanup(request)
})

test.afterAll(async ({ request }) => {
  await cleanup(request)
})

async function adminLogin(page: Page) {
  await page.goto('/admin')
  const emailInput = page.getByRole('textbox', { name: /Email/ })
  const passwordInput = page.getByRole('textbox', { name: /Password/ })
  const email = process.env.SEED_ADMIN_EMAIL as string
  const password = process.env.SEED_ADMIN_PASSWORD as string
  // Fields are re-filled until they stick: a fill before hydration is wiped by React
  await expect(async () => {
    await emailInput.fill(email)
    await passwordInput.fill(password)
    await expect(emailInput).toHaveValue(email, { timeout: 500 })
    await expect(passwordInput).toHaveValue(password, { timeout: 500 })
  }).toPass()
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.locator('span[title="Dashboard"]')).toBeVisible()
}

test('owner publishes a new product and shoppers see it', async ({ page, request }) => {
  test.setTimeout(120_000)
  await login(request)
  // The image is uploaded through REST first (alt "Stacking rings"); the admin UI then selects it
  const upload = await request.post('/api/media', {
    headers: authHeaders(),
    multipart: {
      _payload: JSON.stringify({ alt: ALT }),
      file: {
        name: 'sample.jpg',
        mimeType: 'image/jpeg',
        buffer: readFileSync(path.resolve('tests/fixtures/sample.jpg')),
      },
    },
  })
  expect(upload.ok()).toBeTruthy()

  await adminLogin(page)

  // Create the product through the admin UI
  await page.goto('/admin/collections/products/create')
  const titleInput = page.locator('input[name="title"]')
  await expect(async () => {
    await titleInput.fill(TITLE)
    await expect(titleInput).toHaveValue(TITLE, { timeout: 500 })
  }).toPass()

  // Category
  await page.locator('#field-category .rs__control').click()
  await page.getByRole('option', { name: 'Toys & Games' }).click()

  await page.locator('input[name="price"]').fill('349')

  // Image: choose the uploaded media from the library drawer
  await page.locator('#field-images').getByRole('button', { name: 'Choose from existing' }).click()
  const drawer = page.getByRole('dialog')
  await drawer.getByText('sample.jpg').first().click()
  await expect(page.getByRole('img', { name: ALT })).toBeVisible()

  // Variant
  await page.locator('#field-variants').getByRole('button', { name: 'Add Variant' }).click()
  await page.locator('input[name="variants.0.name"]').fill('Default')
  await page.locator('input[name="variants.0.stock"]').fill('2')

  // Tax and shipping
  await page.locator('input[name="tax.hsnCode"]').fill('9503')
  await page.locator('input[name="tax.gstRate"]').fill('12')
  await page.locator('input[name="shipping.weightGrams"]').fill('300')
  await page.locator('input[name="shipping.lengthCm"]').fill('20')
  await page.locator('input[name="shipping.widthCm"]').fill('10')
  await page.locator('input[name="shipping.heightCm"]').fill('10')

  await page.getByRole('button', { name: 'Publish' }).first().click()
  await expect(page.getByText('successfully').first()).toBeVisible()

  // Shoppers see the new product in the listing
  await page.goto('/shop')
  const card = page.getByTestId('product-card').filter({ hasText: TITLE })
  await expect(card).toBeVisible()
  await expect(card).toContainText('₹349')

  // A shopper buys both units with cash on delivery
  await page.goto(`/p/${SLUG}`)
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible()
  const stepper = page.getByRole('group', { name: 'Quantity' })
  await expect(async () => {
    await stepper.getByRole('button', { name: 'Increase quantity' }).click()
    await expect(stepper.locator('output')).toHaveText('2', { timeout: 1000 })
  }).toPass()
  const cartDrawer = page.getByRole('dialog', { name: 'Cart' })
  await expect(async () => {
    await page.getByRole('button', { name: 'Add to cart' }).click()
    await expect(cartDrawer).toBeVisible({ timeout: 1000 })
  }).toPass()
  await cartDrawer.getByRole('link', { name: 'Checkout' }).click()
  await expect(page).toHaveURL(/\/checkout$/)
  await page.getByLabel('Full name').fill('Neha Gupta')
  await page.getByLabel('Mobile number').fill('98765 00004')
  await page.getByLabel('Address line 1').fill('9 Hill Road')
  await page.getByLabel('Pincode').fill('226001')
  await expect(page.getByLabel('City')).toHaveValue('Lucknow')
  await expect(page.getByLabel('State')).toHaveValue('Uttar Pradesh')
  await page.getByRole('radio', { name: 'Cash on delivery' }).check()
  await page.getByRole('button', { name: 'Place order' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Order received' })).toBeVisible()

  // Final: the product page shows it sold out without any redeploy
  await page.goto(`/p/${SLUG}`)
  await expect(page.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
  await expect(page.getByText('Out of stock').first()).toBeVisible()
})
