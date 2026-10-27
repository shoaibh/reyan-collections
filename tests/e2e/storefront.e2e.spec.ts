import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

import { setPublished, setVariantStock } from './helpers/productRest'

/** WCAG 2 A/AA scan; serious and critical findings fail the test, and are listed in the message. */
async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
  expect(serious).toEqual([])
}

test('Instagram visitor browses and fills a cart', async ({ page }) => {
  // An Instagram visitor lands on the links page first
  await page.goto('/links')
  await expect(page.getByRole('img', { name: 'Reyan Collections logo' })).toBeVisible()
  const buttons = page.getByTestId('link-button')
  await expect(buttons).toHaveCount(5)
  await expect(buttons.first()).toContainText('Shop on our website')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expectNoSeriousViolations(page)
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

  await expectNoSeriousViolations(page)

  // Category listing
  await tiles.getByRole('link', { name: /Kitchen & Home/ }).click()
  await expect(page).toHaveURL(/\/c\/kitchen-and-home$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Kitchen & Home' })).toBeVisible()
  const cards = page.getByTestId('product-card')
  await expect(cards).toHaveCount(2)
  await expect(cards.filter({ hasText: 'Mexico premium container, set of 2' })).toHaveCount(1)
  await expect(cards.filter({ hasText: 'Portable juicer, 400 ml, USB charging' })).toHaveCount(1)

  await expectNoSeriousViolations(page)

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

  await expectNoSeriousViolations(page)

  // Cart: add two Sand containers, then raise to the stock limit of 3
  await page.getByRole('group', { name: 'Quantity' }).getByRole('button', { name: 'Increase quantity' }).click()
  await expect(page.getByRole('group', { name: 'Quantity' }).locator('output')).toHaveText('2')
  const addToCart = page.getByRole('button', { name: 'Add to cart' })
  await expect(addToCart).toBeEnabled()
  // A click before hydration is lost, so retry until the drawer opens
  const drawer = page.getByRole('dialog', { name: 'Cart' })
  await expect(async () => {
    await addToCart.click()
    await expect(drawer).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(drawer.getByText('Mexico premium container, set of 2 — Sand')).toBeVisible()
  await expect(drawer.locator('output')).toHaveText('2')
  await drawer.getByRole('button', { name: 'Increase quantity' }).click()
  await expect(drawer.locator('output')).toHaveText('3')
  await expect(drawer.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()

  // Esc closes the drawer and returns focus to the cart button
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  const cartButton = page.getByRole('banner').getByRole('button', { name: /^Cart/ })
  await expect(cartButton).toBeFocused()
  await expect(cartButton).toContainText('3')

  // The cart persists across a reload
  await page.reload()
  await expect(cartButton).toContainText('3')

  // Final: the subtotal reflects 3 x ₹449
  await expect(async () => {
    await cartButton.click()
    await expect(drawer).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(drawer.getByTestId('cart-subtotal')).toHaveText('₹1,347')
  await expectNoSeriousViolations(page)
})

test('cart shows a product that went unavailable', async ({ page, request }) => {
  await page.goto('/p/duck-climbing-track-toy-with-music')
  const addToCart = page.getByRole('button', { name: 'Add to cart' })
  const drawer = page.getByRole('dialog', { name: 'Cart' })
  await expect(async () => {
    await addToCart.click()
    await expect(drawer).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(drawer.getByText('Duck climbing track toy with music')).toBeVisible()

  await setPublished(request, 'duck-climbing-track-toy-with-music', false)
  try {
    await page.goto('/')
    const cartButton = page.getByRole('banner').getByRole('button', { name: /^Cart/ })
    await expect(async () => {
      await cartButton.click()
      await expect(drawer).toBeVisible({ timeout: 1000 })
    }).toPass()
    await expect(drawer.getByText('No longer available')).toBeVisible()
    await expect(drawer.getByRole('button', { name: /Remove/ })).toBeVisible()
    await expect(drawer.getByText('Subtotal')).toBeVisible()
    await expect(drawer.getByTestId('cart-subtotal')).toHaveText('₹0')
    // The unavailable line does not count toward the badge
    await expect(cartButton).toContainText('0')
    await expect(cartButton).toHaveAccessibleName('Cart, 0 items')
  } finally {
    await setPublished(request, 'duck-climbing-track-toy-with-music', true)
  }
})

test('fully out-of-stock product cannot be added', async ({ page, request }) => {
  const restore = await setVariantStock(request, 'induction-flight-rc-helicopter', 'Default', 0)
  try {
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
    await restore()
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

test('cart clamps a quantity above live stock', async ({ page, request }) => {
  await page.goto('/p/mexico-premium-container-set-of-2')
  const sand = page.getByRole('button', { name: 'Sand', exact: true })
  await expect(async () => {
    await sand.click()
    await expect(sand).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
  }).toPass()
  const stepper = page.getByRole('group', { name: 'Quantity' })
  await stepper.getByRole('button', { name: 'Increase quantity' }).click()
  await stepper.getByRole('button', { name: 'Increase quantity' }).click()
  await expect(stepper.locator('output')).toHaveText('3')
  const drawer = page.getByRole('dialog', { name: 'Cart' })
  await expect(async () => {
    await page.getByRole('button', { name: 'Add to cart' }).click()
    await expect(drawer).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(drawer.locator('output')).toHaveText('3')
  await page.keyboard.press('Escape')

  const restore = await setVariantStock(request, 'mexico-premium-container-set-of-2', 'Sand', 1)
  try {
    await page.reload()
    const cartButton = page.getByRole('banner').getByRole('button', { name: /^Cart/ })
    // The stored quantity is written back clamped, so the badge shows the stock
    await expect(cartButton).toHaveAccessibleName('Cart, 1 item')
    await expect(async () => {
      await cartButton.click()
      await expect(drawer).toBeVisible({ timeout: 1000 })
    }).toPass()
    await expect(drawer.getByText('Only 1 left; we updated your quantity')).toBeVisible()
    await expect(drawer.locator('output')).toHaveText('1')
    await expect(drawer.getByTestId('cart-subtotal')).toHaveText('₹449')
  } finally {
    await restore()
  }
})
