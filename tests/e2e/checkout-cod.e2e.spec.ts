import { test, expect } from '@playwright/test'

import { addToCartAndCheckout, fillShopper } from './helpers/checkout'
import { setVariantStock } from './helpers/productRest'

test('shopper orders cash on delivery and finds the order again', async ({ page, request }) => {
  try {
    await page.goto('/p/duck-climbing-track-toy-with-music')
    await expect(page.getByRole('heading', { level: 1, name: 'Duck climbing track toy with music' })).toBeVisible()
    await addToCartAndCheckout(page)

    await fillShopper(page, {
      name: 'Ravi Kumar',
      phone: '98765 00002',
      line1: '4 Lake View',
      pincode: '400001',
      city: 'Mumbai',
      state: 'Maharashtra',
    })

    // Cash on delivery, then place the order
    await page.getByRole('radio', { name: 'Cash on delivery' }).check()
    await expect(page.getByRole('radio', { name: 'Cash on delivery' })).toBeChecked()
    await page.getByRole('button', { name: 'Place order' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Order received' })).toBeVisible()
    await expect(page.getByText("We'll WhatsApp you shortly to confirm your order.")).toBeVisible()
    await expect(page.getByText('Cash on delivery', { exact: true })).toBeVisible()
    const orderNumber = (await page.getByText(/^Order RC\d{4}/).first().innerText()).replace('Order ', '').trim()
    expect(orderNumber).toMatch(/^RC\d{4}$/)

    // Track it: the wrong phone finds nothing, the right one (with +91 and a space) opens the order
    await page.goto('/track')
    const find = page.getByRole('button', { name: 'Find my order' })
    await page.getByLabel('Order number').fill(orderNumber.toLowerCase())
    await page.getByLabel('Mobile number').fill('9876500099')
    await find.click()
    await expect(page.getByText("We couldn't find an order with that number and phone.")).toBeVisible()

    await page.getByLabel('Mobile number').fill('+91 98765 00002')
    await find.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Order received' })).toBeVisible()
    await expect(page.getByText(`Order ${orderNumber}`).first()).toBeVisible()
  } finally {
    // The order reserved one duck; put the seeded stock back for later specs
    await setVariantStock(request, 'duck-climbing-track-toy-with-music', 'Default', 10)
  }
})
