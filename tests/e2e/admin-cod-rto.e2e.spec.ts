import { test, expect } from '@playwright/test'

import { adminLogin, adminToken } from './helpers/admin'
import { addToCart, fillShopper } from './helpers/checkout'
import { setVariantStock } from './helpers/productRest'

const JUICER = '/p/portable-juicer-400-ml-usb-charging'
const BLOCKED_PHONE = '9876500012'

test('owner confirms a COD order on WhatsApp and handles a refused parcel', async ({ page, request }) => {
  test.setTimeout(180_000)
  try {
    // The shopper places a COD order for one juicer
    await page.goto(JUICER)
    await expect(page.getByRole('heading', { level: 1, name: 'Portable juicer, 400 ml, USB charging' })).toBeVisible()
    await addToCart(page)
    await page.getByRole('dialog', { name: 'Cart' }).getByRole('link', { name: 'Checkout' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible()
    await fillShopper(page, {
      name: 'Priya Sharma',
      phone: '98765 00012',
      line1: '5 Civil Lines',
      pincode: '226010',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
    })
    await page.getByRole('radio', { name: 'Cash on delivery' }).check()
    await expect(page.getByRole('radio', { name: 'Cash on delivery' })).toBeChecked()
    await page.getByRole('button', { name: 'Place order' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Order received' })).toBeVisible()
    const orderNumber = (await page.getByText(/^Order RC\d{4}/).first().innerText()).replace('Order ', '').trim()
    expect(orderNumber).toMatch(/^RC\d{4}$/)

    // The owner sees it under Confirm COD orders, with a WhatsApp message ready
    await adminLogin(page)
    const confirm = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Confirm COD orders' }) })
    const row = confirm.locator('div').filter({ hasText: `#${orderNumber} · Priya S.` }).filter({ has: page.getByRole('button', { name: 'Confirm order' }) }).last()
    await expect(row).toBeVisible()
    const wa = decodeURIComponent((await row.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')) ?? '').replace(/\+/g, ' ')
    expect(wa).toContain('Hi Priya!')
    expect(wa).toContain('₹799')
    expect(wa).toContain('Lucknow 226010')
    expect(wa).toContain(`Order ${orderNumber}`)

    // One click on ✓: the row leaves Confirm and shows up under Ready to ship
    await row.getByRole('button', { name: 'Confirm order' }).click()
    const ready = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ready to ship' }) })
    await expect(ready.getByText(`#${orderNumber} · Portable juicer`)).toBeVisible()
    await expect(ready.getByText('COD confirmed · Lucknow 226010')).toBeVisible()
    await expect(confirm.getByText(`#${orderNumber}`)).toHaveCount(0)

    // Ship it from the order, then the courier reports the parcel refused
    await page.goto('/admin/collections/orders')
    await page.getByRole('link', { name: orderNumber }).first().click()
    await expect(page.getByRole('heading', { name: `Order ${orderNumber}` })).toBeVisible()
    await page.getByRole('button', { name: 'Ship with Shiprocket' }).click()
    await expect(page.getByText(/MOCKAWB/).first()).toBeVisible()
    await page.getByRole('button', { name: 'RTO', exact: true }).click()
    await expect(page.getByText('Returned to us', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Phone added to COD blocklist' })).toBeVisible()

    // The phone is on the COD blocklist
    await page.goto('/admin/collections/cod-blocklist')
    await expect(page.getByText(BLOCKED_PHONE).first()).toBeVisible()

    // The same phone can no longer pay cash on delivery
    await page.goto(JUICER)
    await addToCart(page)
    await page.getByRole('dialog', { name: 'Cart' }).getByRole('link', { name: 'Checkout' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible()
    await page.getByLabel('Mobile number').fill('98765 00012')
    await page.getByRole('textbox', { name: 'Pincode' }).fill('226001')
    await expect(page.getByRole('radio', { name: /Cash on delivery/ })).toBeDisabled()
    await expect(page.getByText("Cash on delivery isn't available for this order. Please pay online.")).toBeVisible()
  } finally {
    // The order took one juicer (the RTO did not restock it); the blocklist entry would block later runs
    await setVariantStock(request, 'portable-juicer-400-ml-usb-charging', 'Default', 5)
    const token = await adminToken(request)
    const headers = { Authorization: `JWT ${token}` }
    const found = await request.get(`/api/cod-blocklist?where[phone][equals]=${BLOCKED_PHONE}&depth=0`, { headers })
    for (const doc of ((await found.json()) as { docs?: { id: number }[] }).docs ?? []) {
      await request.delete(`/api/cod-blocklist/${doc.id}`, { headers })
    }
  }
})
