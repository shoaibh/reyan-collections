import { test, expect } from '@playwright/test'

import { addToCart, addToCartAndCheckout, fillShopper, raiseQuantity } from './helpers/checkout'
import { setVariantStock } from './helpers/productRest'

test('checkout blocks what it must and holds an unpaid order', async ({ page, request }) => {
  try {
    await page.goto('/p/karaoke-speaker-with-2-wireless-mics')
    await expect(page.getByRole('heading', { level: 1, name: 'Karaoke speaker with 2 wireless mics' })).toBeVisible()
    // Two speakers cost ₹2,598, above the cash on delivery limit
    await raiseQuantity(page, 2)
    await addToCartAndCheckout(page)

    const place = page.getByRole('button', { name: 'Place order' })

    // An unserviceable pincode blocks the order
    await page.getByLabel('Mobile number').fill('98765 00003')
    await page.getByLabel('Pincode').fill('000000')
    await expect(page.getByText("Sorry, we can't deliver to 000000 yet")).toBeVisible()
    await expect(place).toBeDisabled()

    // A serviceable pincode unlocks the order, but cash on delivery is over its limit
    await page.getByLabel('Pincode').fill('226001')
    await expect(page.getByText('Delivers to Lucknow in 3–5 days')).toBeVisible()
    await expect(page.getByRole('radio', { name: /Cash on delivery/ })).toBeDisabled()
    await expect(page.getByText('Cash on delivery is available on orders up to ₹2,000')).toBeVisible()

    // Pay online, then fail the payment on the mock page
    await fillShopper(page, {
      name: 'Meera Shah',
      phone: '98765 00003',
      line1: '7 Garden Lane',
      pincode: '226001',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
    })
    await expect(page.getByRole('radio', { name: 'Pay online' })).toBeChecked()
    await expect(place).toBeEnabled()
    await place.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Test payment' })).toBeVisible()
    await page.getByRole('button', { name: 'Fail' }).click()

    // The order is held unpaid and can be paid again
    await expect(page.getByRole('heading', { level: 1, name: 'Payment pending' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Complete payment' })).toBeVisible()
  } finally {
    // The held order reserved 2 karaoke speakers; put the seeded stock back
    await setVariantStock(request, 'karaoke-speaker-with-2-wireless-mics', 'Default', 8)
  }
})

test('checkout places exactly what the summary shows when stock falls below the cart', async ({ page, request }) => {
  try {
    // Three Sand in the cart (all there is)
    await page.goto('/p/mexico-premium-container-set-of-2')
    const sand = page.getByRole('button', { name: 'Sand', exact: true })
    await expect(async () => {
      await sand.click()
      await expect(sand).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
    }).toPass()
    await raiseQuantity(page, 3)
    await addToCart(page)
    const drawer = page.getByRole('dialog', { name: 'Cart' })
    await expect(drawer.locator('output')).toHaveText('3')

    // Stock drops to 2 before the shopper reaches checkout
    await setVariantStock(request, 'mexico-premium-container-set-of-2', 'Sand', 2)
    await drawer.getByRole('link', { name: 'Checkout' }).click()
    await expect(page).toHaveURL(/\/checkout$/)

    // The summary shows the clamped quantity and says why
    const summary = page.getByRole('region', { name: 'Order summary' })
    await expect(summary.getByText('× 2')).toBeVisible()
    await expect(summary.getByText('Only 2 left')).toBeVisible()

    // (The pincode textbox is addressed by role: the disabled cash on delivery option mentions "pincode")
    await page.getByLabel('Full name').fill('Neha Rao')
    await page.getByLabel('Mobile number').fill('98765 00005')
    await page.getByLabel('Address line 1').fill('9 Hill Street')
    await page.getByRole('textbox', { name: 'Pincode' }).fill('226001')
    await expect(page.getByLabel('City')).toHaveValue('Lucknow')
    await expect(page.getByLabel('State')).toHaveValue('Uttar Pradesh')
    await expect(page.getByText('Delivers to Lucknow in 3–5 days · COD available')).toBeVisible()

    // The order is accepted at the summary's total (no "total changed" bounce)
    await page.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Test payment' })).toBeVisible()
    await page.getByRole('button', { name: 'Succeed' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Order confirmed' })).toBeVisible()
    await expect(page.getByText('Mexico premium container, set of 2 — Sand')).toBeVisible()
  } finally {
    // The order took 2 Sand, and storefront.e2e asserts "Only 3 left"
    await setVariantStock(request, 'mexico-premium-container-set-of-2', 'Sand', 3)
  }
})
