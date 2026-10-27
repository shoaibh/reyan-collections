import { test, expect } from '@playwright/test'

test('Instagram visitor browses and fills a cart', async ({ page }) => {
  await page.goto('/')

  // Brand lockup and announcement bar
  await expect(page.getByRole('banner').getByRole('link', { name: 'Reyan Collections' })).toBeVisible()
  await expect(page.getByText('Dispatched within 24 hours')).toBeVisible()

  // Navigation lives behind the menu button on a phone
  const menuButton = page.getByRole('button', { name: 'Menu' })
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  // A click before hydration is lost, so retry until the menu opens
  await expect(async () => {
    await menuButton.click()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 })
  }).toPass()
  await expect(page.getByRole('link', { name: 'Toys & Games', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Kitchen & Home', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Gifts under ₹499' })).toBeVisible()

  // Footer
  await expect(page.getByRole('contentinfo').getByText('Daily finds • Home • Toys')).toBeVisible()

  // Floating WhatsApp button
  await expect(page.getByRole('link', { name: 'Chat on WhatsApp' })).toBeVisible()

  // Close the menu so the page underneath is reachable
  await menuButton.click()
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false')

  // Hero
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Fun for little hands.')
  await expect(page.getByRole('heading', { level: 1 }).getByText('Joy', { exact: true })).toBeVisible()
  const tag = page.getByTestId('price-tag')
  await expect(tag.getByText('₹1,299 here')).toBeVisible()
  await expect(tag.getByText('₹1,499 on Amazon')).toBeVisible()

  // Trust row reads the return window from settings
  await expect(page.getByText('Easy 7-day returns')).toBeVisible()

  // Category tiles
  const tiles = page.getByRole('region', { name: 'Shop by what you need' })
  await expect(tiles.getByRole('link', { name: /Toys & Games/ })).toBeVisible()
  await expect(tiles.getByRole('link', { name: /Kitchen & Home/ })).toBeVisible()

  // Favourites
  const favourites = page.getByRole('region', { name: "This week's favourites" })
  await expect(favourites.getByRole('heading', { name: "This week's favourites" })).toBeVisible()
  await expect(favourites.getByTestId('product-card')).toHaveCount(4)
  await expect(favourites.getByRole('link').filter({ has: page.getByTestId('product-card') })).toHaveCount(4)
  await expect(favourites.getByText('Save ₹200')).toBeVisible()

  // No horizontal overflow on a phone
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(390)

  // The page ends on the "why buy directly" band
  await expect(page.getByRole('heading', { name: 'Why buy directly from us?' })).toBeVisible()
})

test('hero without a featured product still renders', async ({ page, request }) => {
  const login = await request.post('/api/users/login', {
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  })
  expect(login.ok()).toBeTruthy()
  const { token } = (await login.json()) as { token: string }
  const headers = { Authorization: `JWT ${token}` }

  const current = await request.get('/api/globals/homepage?depth=0&draft=false', { headers })
  expect(current.ok()).toBeTruthy()
  const originalProductA = ((await current.json()) as { hero: { productA: number | null } }).hero.productA
  expect(originalProductA).not.toBeNull()

  const setProductA = async (productA: number | null) => {
    const res = await request.post('/api/globals/homepage', {
      headers,
      data: { hero: { productA }, _status: 'published' },
    })
    expect(res.ok()).toBeTruthy()
  }

  try {
    await setProductA(null)
    // Cache revalidation runs in an afterChange hook; retry until the page reflects the change
    await expect(async () => {
      await page.goto('/')
      await expect(page.getByTestId('price-tag')).toHaveCount(0, { timeout: 1000 })
    }).toPass()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Fun for little hands.')
  } finally {
    await setProductA(originalProductA)
  }

  // The restore reaches the storefront too: the price tag is back
  await expect(async () => {
    await page.goto('/')
    await expect(page.getByTestId('price-tag')).toBeVisible({ timeout: 1000 })
  }).toPass()
})
