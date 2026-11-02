import { test, expect, type Page } from '@playwright/test'

import { adminToken } from './helpers/admin'
import { addToCartAndCheckout, fillShopper, raiseQuantity } from './helpers/checkout'
import { setVariantStock } from './helpers/productRest'

const SLUG = 'mexico-premium-container-set-of-2'

async function pickSand(page: Page) {
  await page.goto(`/p/${SLUG}`)
  const sand = page.getByRole('button', { name: 'Sand', exact: true })
  await expect(async () => {
    await sand.click()
    await expect(sand).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
  }).toPass()
}

test('an unpaid order expires and its stock comes back', async ({ page, request }) => {
  test.setTimeout(180_000)
  try {
    // The shopper puts all 3 Sand in the cart and fails the payment
    await pickSand(page)
    await raiseQuantity(page, 3)
    await addToCartAndCheckout(page)
    await fillShopper(page, {
      name: 'Zoya Khan',
      phone: '98765 00013',
      line1: '8 River Side',
      pincode: '226001',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
    })
    await page.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Test payment' })).toBeVisible()
    await page.getByRole('button', { name: 'Fail' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Payment pending' })).toBeVisible()
    const orderUrl = page.url()

    // The held order has taken every Sand
    await pickSand(page)
    await expect(page.getByText('Out of stock').first()).toBeVisible()

    // An hour passes: the expiry job cancels the unpaid order
    const token = await adminToken(request)
    const jobs = await request.post('/api/dev/run-jobs', {
      headers: { Authorization: `JWT ${token}` },
      data: { aheadMinutes: 60 },
    })
    expect(jobs.ok()).toBeTruthy()
    await page.goto(orderUrl)
    await expect(page.getByRole('heading', { level: 1, name: 'Cancelled' })).toBeVisible()

    // The stock is back
    await pickSand(page)
    await expect(page.getByText('Only 3 left')).toBeVisible()
  } finally {
    // Idempotent safety net: storefront.e2e asserts "Only 3 left"
    await setVariantStock(request, SLUG, 'Sand', 3)
  }
})
