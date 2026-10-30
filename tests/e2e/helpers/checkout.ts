import { expect, type Page } from '@playwright/test'

/**
 * Clicks "Add to cart" until the cart drawer opens. A click before hydration is lost, so it is
 * retried; the header badge guards every retry, so a slow render can never add the line twice.
 */
export async function addToCart(page: Page) {
  const drawer = page.getByRole('dialog', { name: 'Cart' })
  const cartButton = page.getByRole('banner').getByRole('button', { name: /^Cart/ })
  const itemCount = async () => {
    const label = (await cartButton.getAttribute('aria-label')) ?? ''
    return Number(/(\d+)/.exec(label)?.[1] ?? 0)
  }
  const before = await itemCount()
  await expect(async () => {
    if (!(await drawer.isVisible()) && (await itemCount()) === before) {
      await page.getByRole('button', { name: 'Add to cart' }).click()
    }
    await expect(drawer).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 20_000 })
}

/** Adds the product to the cart and goes to checkout. */
export async function addToCartAndCheckout(page: Page) {
  await addToCart(page)
  const drawer = page.getByRole('dialog', { name: 'Cart' })
  await drawer.getByRole('link', { name: 'Checkout' }).click()
  await expect(page).toHaveURL(/\/checkout$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible()
}

/** Sets the product page quantity to `to`. Idempotent: it clicks only while below the target, so it never overshoots. */
export async function raiseQuantity(page: Page, to: number) {
  const stepper = page.getByRole('group', { name: 'Quantity' })
  const output = stepper.locator('output')
  await expect(async () => {
    const current = Number((await output.innerText()).trim())
    if (current < to) await stepper.getByRole('button', { name: 'Increase quantity' }).click()
    await expect(output).toHaveText(String(to), { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
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
