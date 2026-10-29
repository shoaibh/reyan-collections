import { test, expect } from '@playwright/test'

import { setVariantStock } from './helpers/productRest'

test('Instagram shopper pays online with a discount code', async ({ page, request }) => {
  try {
    // Land on the links page, go to the shop, and open the container
    await page.goto('/links')
    await page.getByRole('link', { name: 'Shop on our website' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page
      .getByRole('link')
      .filter({ has: page.getByTestId('product-card'), hasText: 'Mexico premium container, set of 2' })
      .first()
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Mexico premium container, set of 2' })).toBeVisible()

    // Pick Sand and add it to the cart (a click before hydration is lost, so retry)
    const sand = page.getByRole('button', { name: 'Sand', exact: true })
    await expect(async () => {
      await sand.click()
      await expect(sand).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
    }).toPass()
    await expect(page.getByText('Colour: Sand')).toBeVisible()
    const drawer = page.getByRole('dialog', { name: 'Cart' })
    await expect(async () => {
      await page.getByRole('button', { name: 'Add to cart' }).click()
      await expect(drawer).toBeVisible({ timeout: 1000 })
    }).toPass()
    await drawer.getByRole('link', { name: 'Checkout' }).click()
    await expect(page).toHaveURL(/\/checkout$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible()

    // Contact and address; the pincode fills city and state and shows the delivery message
    await page.getByLabel('Full name').fill('Asha Verma')
    await page.getByLabel('Mobile number').fill('98765 00001')
    await page.getByLabel('Address line 1').fill('12 Park Road')
    await page.getByLabel('Pincode').fill('226001')
    await expect(page.getByLabel('City')).toHaveValue('Lucknow')
    await expect(page.getByLabel('State')).toHaveValue('Uttar Pradesh')
    await expect(page.getByText('Delivers to Lucknow in 3–5 days · COD available')).toBeVisible()

    // The code needs a bigger cart first
    await page.getByLabel('Discount code').fill('diwali10')
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByText('Add ₹50 more to use this code')).toBeVisible()

    // Raise the quantity from the drawer; the applied code becomes valid on its own
    await page.getByRole('button', { name: 'Edit cart' }).click()
    await drawer.getByRole('button', { name: 'Increase quantity' }).click()
    await expect(drawer.locator('output')).toHaveText('2')
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()

    const summary = page.getByRole('region', { name: 'Order summary' })
    await expect(page.getByText('DIWALI10 applied')).toBeVisible()
    await expect(summary.getByText('Discount (DIWALI10)')).toBeVisible()
    await expect(summary.getByTestId('row-discount')).toContainText('−₹90')
    await expect(summary.getByTestId('row-shipping')).toContainText('Free')
    await expect(summary.getByTestId('row-total')).toContainText('₹808')

    // Place the order and pay on the mock payment page
    await page.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Test payment' })).toBeVisible()
    await expect(page.getByText('₹808')).toBeVisible()
    await page.getByRole('button', { name: 'Succeed' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Order confirmed' })).toBeVisible()
    await expect(page.getByText(/Order RC\d{4}/).first()).toBeVisible()
    await expect(page.getByText('Mexico premium container, set of 2 — Sand')).toBeVisible()
    await expect(page.getByText('Paid online')).toBeVisible()

    // Stock was reserved: one Sand is left
    await page.goto('/p/mexico-premium-container-set-of-2')
    const sandAgain = page.getByRole('button', { name: 'Sand', exact: true })
    await expect(async () => {
      await sandAgain.click()
      await expect(sandAgain).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
    }).toPass()
    await expect(page.getByText('Only 1 left')).toBeVisible()
  } finally {
    // The order consumed 2 Sand, and storefront.e2e asserts "Only 3 left". The product hook keeps the
    // live stock when a save equals the stock the latest version loaded (3), so a single write of 3
    // is ignored: go through 2 first, then 3.
    await setVariantStock(request, 'mexico-premium-container-set-of-2', 'Sand', 2)
    await setVariantStock(request, 'mexico-premium-container-set-of-2', 'Sand', 3)
  }
})
