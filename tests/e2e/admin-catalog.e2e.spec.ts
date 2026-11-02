import { test, expect } from '@playwright/test'

import { setVariantStock } from './helpers/productRest'

test('owner manages stock of a colour variant', async ({ page, request }) => {
  const email = process.env.SEED_ADMIN_EMAIL as string
  const password = process.env.SEED_ADMIN_PASSWORD as string

  // The branded logo is on the login screen
  await page.goto('/admin')
  await expect(page.getByRole('img', { name: 'Reyan Collections' })).toBeVisible()

  // Fields are re-filled until they stick: a fill before hydration is wiped by React
  const emailInput = page.getByRole('textbox', { name: /Email/ })
  const passwordInput = page.getByRole('textbox', { name: /Password/ })
  await expect(async () => {
    await emailInput.fill(email)
    await passwordInput.fill(password)
    await expect(emailInput).toHaveValue(email, { timeout: 500 })
    await expect(passwordInput).toHaveValue(password, { timeout: 500 })
  }).toPass()
  await page.getByRole('button', { name: 'Login' }).click()
  // The Today view's heading: "N things need you" or "All caught up"
  await expect(page.getByRole('heading', { level: 1, name: /needs? you|All caught up/ })).toBeVisible()

  // Products list shows the seeded product
  await page.goto('/admin/collections/products')
  const row = page.getByText('Mexico premium container, set of 2')
  await expect(row).toBeVisible()
  // The row's link sits on its image cell (the first column), not on the title text
  await page.getByRole('row', { name: /Mexico premium container, set of 2/ }).getByRole('link').first().click()

  // Both colour variants are present
  await expect(page.locator('input[name="variants.0.name"]')).toHaveValue('Mint')
  await expect(page.locator('input[name="variants.1.name"]')).toHaveValue('Sand')

  // Later specs read the seeded stock, so restore the exact original variant rows whatever happens
  const restoreSand = await setVariantStock(request, 'mexico-premium-container-set-of-2', 'Sand', 3)

  try {
    // Set Sand's stock and publish
    await page.locator('input[name="variants.1.stock"]').fill('7')
    await page.getByRole('button', { name: 'Publish changes' }).click()
    await expect(page.getByText('Updated successfully.').first()).toBeVisible()

    // The new stock survives a reload
    await page.reload()
    await expect(page.locator('input[name="variants.1.stock"]')).toBeVisible()
    await expect(page.locator('input[name="variants.1.stock"]')).toHaveValue('7')
  } finally {
    await restoreSand()
  }
})
