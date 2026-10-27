import { test, expect } from '@playwright/test'

test('Instagram visitor browses and fills a cart', async ({ page }) => {
  // An Instagram visitor lands on the links page first
  await page.goto('/links')
  await expect(page.getByRole('img', { name: 'Reyan Collections logo' })).toBeVisible()
  const buttons = page.getByTestId('link-button')
  await expect(buttons).toHaveCount(5)
  await expect(buttons.first()).toContainText('Shop on our website')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('link', { name: 'Shop on our website' }).click()
  await expect(page).toHaveURL(/\/$/)

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

  // Category listing
  await tiles.getByRole('link', { name: /Kitchen & Home/ }).click()
  await expect(page).toHaveURL(/\/c\/kitchen-and-home$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen & Home' })).toBeVisible()
  const cards = page.getByTestId('product-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.filter({ hasText: 'Mexico premium container, set of 2' })).toHaveCount(1)
  await expect(cards.filter({ hasText: 'Portable juicer, 400 ml, USB charging' })).toHaveCount(1)

  // Search from the header (a phone shows a search icon that opens /shop)
  await page.getByRole('banner').getByRole('link', { name: 'Search products' }).click()
  await expect(page).toHaveURL(/\/shop$/)
  const search = page.getByRole('search').getByRole('searchbox', { name: 'Search products' })
  await search.fill('duck')
  await search.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Results for "duck"' })).toBeVisible()
  await expect(cards).toHaveCount(1)
  await expect(cards.filter({ hasText: 'Duck climbing track toy with music' })).toBeVisible()

  // Product page: pick a variant, see live stock, check delivery
  await page.goto('/p/mexico-premium-container-set-of-2')
  await expect(page.getByRole('heading', { level: 1, name: 'Mexico premium container, set of 2' })).toBeVisible()
  await expect(page.getByText('Prices include GST')).toBeVisible()
  await expect(page.getByText('Colour: Mint')).toBeVisible()
  const sand = page.getByRole('button', { name: 'Sand', exact: true })
  // A click before hydration is lost, so retry until the swatch is selected
  await expect(async () => {
    await sand.click()
    await expect(sand).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
  }).toPass()
  await expect(page.getByText('Colour: Sand')).toBeVisible()
  await expect(page.getByText('Only 3 left')).toBeVisible()

  const pincode = page.getByLabel('Pincode')
  await pincode.fill('226010')
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(page.getByText(/COD available/)).toBeVisible()
  await pincode.fill('000000')
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(page.getByText("Sorry, we can't deliver to 000000 yet")).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  const addToCart = page.getByRole('button', { name: 'Add to cart' })
  await expect(addToCart).toBeVisible()
  await expect(addToCart).toBeEnabled()
})

test('fully out-of-stock product cannot be added', async ({ page, request }) => {
  const login = await request.post('/api/users/login', {
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  })
  expect(login.ok()).toBeTruthy()
  const { token } = (await login.json()) as { token: string }
  const headers = { Authorization: `JWT ${token}` }

  type Variant = { id: string; name: string; stock: number }
  const found = await request.get(
    '/api/products?where[slug][equals]=induction-flight-rc-helicopter&depth=0&draft=false',
    { headers },
  )
  expect(found.ok()).toBeTruthy()
  const product = ((await found.json()) as { docs: { id: number; variants: Variant[] }[] }).docs[0]
  expect(product).toBeTruthy()
  const original = product.variants[0]

  const setStock = async (stock: number) => {
    const res = await request.patch(`/api/products/${product.id}`, {
      headers,
      data: { variants: [{ id: original.id, name: original.name, stock }], _status: 'published' },
    })
    expect(res.ok()).toBeTruthy()
  }

  try {
    await setStock(0)
    // Cache revalidation runs in an afterChange hook; retry until the listing reflects the change
    const card = page.getByTestId('product-card').filter({ hasText: 'Induction flight RC helicopter' })
    await expect(async () => {
      await page.goto('/shop')
      await expect(card).toContainText('Out of stock', { timeout: 1000 })
    }).toPass()

    await page.goto('/p/induction-flight-rc-helicopter')
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Ask on WhatsApp' })).toBeVisible()
    await expect(page.getByText('Out of stock').first()).toBeVisible()
  } finally {
    await setStock(original.stock)
  }
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

  const originalOverride = ((await current.json()) as { hero: { imageOverrideA: number | null } }).hero
    .imageOverrideA
  const media = await request.get('/api/media?limit=1&depth=0', { headers })
  const mediaId = ((await media.json()) as { docs: { id: number }[] }).docs[0].id

  const setHero = async (productA: number | null, imageOverrideA: number | null) => {
    const res = await request.post('/api/globals/homepage', {
      headers,
      data: { hero: { productA, imageOverrideA }, _status: 'published' },
    })
    expect(res.ok()).toBeTruthy()
  }

  try {
    await setHero(null, mediaId)
    // Cache revalidation runs in an afterChange hook; retry until the page reflects the change
    await expect(async () => {
      await page.goto('/')
      await expect(page.getByTestId('price-tag')).toHaveCount(0, { timeout: 1000 })
    }).toPass()
    // An image override alone must not bring the visual column back
    await expect(page.getByTestId('hero-visual')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Fun for little hands.')
  } finally {
    await setHero(originalProductA, originalOverride)
  }

  // The restore reaches the storefront too: the price tag is back
  await expect(async () => {
    await page.goto('/')
    await expect(page.getByTestId('price-tag')).toBeVisible({ timeout: 1000 })
  }).toPass()
})
