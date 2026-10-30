import { expect, type Page } from '@playwright/test'

/** Clicks "Add to cart" (retrying until the drawer opens, since a click before hydration is lost) and goes to checkout. */
export async function addToCartAndCheckout(page: Page) {
  const drawer = page.getByRole('dialog', { name: 'Cart' })
  await expect(async () => {
    await page.getByRole('button', { name: 'Add to cart' }).click()
    await expect(drawer).toBeVisible({ timeout: 1000 })
  }).toPass()
  await drawer.getByRole('link', { name: 'Checkout' }).click()
  await expect(page).toHaveURL(/\/checkout$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible()
}

/** Raises the product page quantity by one click per step. */
export async function raiseQuantity(page: Page, to: number) {
  const stepper = page.getByRole('group', { name: 'Quantity' })
  for (let n = 2; n <= to; n++) {
    await stepper.getByRole('button', { name: 'Increase quantity' }).click()
  }
  await expect(stepper.locator('output')).toHaveText(String(to))
}

export type Shopper = { name: string; phone: string; line1: string; pincode: string; city: string; state: string }

/** Fills the contact and address cards; city and state are typed over whatever the pincode lookup filled. */
export async function fillShopper(page: Page, s: Shopper) {
  await page.getByLabel('Full name').fill(s.name)
  await page.getByLabel('Mobile number').fill(s.phone)
  await page.getByLabel('Address line 1').fill(s.line1)
  await page.getByLabel('Pincode').fill(s.pincode)
  await page.getByLabel('City').fill(s.city)
  await page.getByLabel('State').selectOption(s.state)
}
