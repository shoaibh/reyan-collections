import { test, expect } from '@playwright/test'

import { adminLogin } from './helpers/admin'
import { addToCartAndCheckout, fillShopper } from './helpers/checkout'
import { setVariantStock } from './helpers/productRest'

test('owner ships a prepaid order and the customer sees it delivered', async ({ page, request }) => {
  test.setTimeout(180_000)
  try {
    // The shopper buys one duck and pays online
    await page.goto('/p/duck-climbing-track-toy-with-music')
    await expect(page.getByRole('heading', { level: 1, name: 'Duck climbing track toy with music' })).toBeVisible()
    await addToCartAndCheckout(page)
    await fillShopper(page, {
      name: 'Kavita Rao',
      phone: '98765 00011',
      line1: '3 Mall Road',
      pincode: '226001',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
    })
    await page.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Test payment' })).toBeVisible()
    await page.getByRole('button', { name: 'Succeed' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Order confirmed' })).toBeVisible()
    const orderUrl = page.url()
    const orderNumber = (await page.getByText(/^Order RC\d{4}/).first().innerText()).replace('Order ', '').trim()
    expect(orderNumber).toMatch(/^RC\d{4}$/)

    // The owner sees it under Ready to ship on Today and ships it (one click, then wait for the row to move)
    await adminLogin(page)
    const ready = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ready to ship' }) })
    const row = ready.locator('div').filter({ hasText: `#${orderNumber}` }).filter({ has: page.getByRole('button', { name: 'Ship' }) }).last()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Ship' }).click()
    await expect(ready.getByText('1 booked, waiting for pickup')).toBeVisible()
    await expect(ready.getByText(`#${orderNumber}`)).toHaveCount(0)

    // Open the order from the orders list
    await page.goto('/admin/collections/orders')
    await page.getByRole('link', { name: orderNumber }).first().click()
    await expect(page.getByRole('heading', { name: `Order ${orderNumber}` })).toBeVisible()
    await expect(page.getByText(/MOCKAWB/).first()).toBeVisible()
    const invoice = page.getByRole('link', { name: 'GST invoice' })
    await expect(invoice).toBeVisible()
    const href = await invoice.getAttribute('href')
    expect(href).toBeTruthy()
    const pdf = await page.request.get(href as string)
    expect(pdf.ok()).toBeTruthy()
    expect(pdf.headers()['content-type']).toContain('application/pdf')

    // The courier moves the parcel (dev "Simulate courier" row)
    await page.getByRole('button', { name: 'Picked up', exact: true }).click()
    await expect(page.locator('span').filter({ hasText: /^Shipped$/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Delivered', exact: true }).click()
    await expect(page.locator('span').filter({ hasText: /^Delivered$/ }).first()).toBeVisible()

    // The customer sees it delivered
    await page.goto(orderUrl)
    await expect(page.getByRole('heading', { level: 1, name: 'Delivered' })).toBeVisible()
  } finally {
    // The order reserved one duck; put the seeded stock back for later specs
    await setVariantStock(request, 'duck-climbing-track-toy-with-music', 'Default', 10)
  }
})
