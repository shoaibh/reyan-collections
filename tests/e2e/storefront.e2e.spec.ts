import { test, expect } from '@playwright/test'

test('Instagram visitor browses and fills a cart', async ({ page }) => {
  await page.goto('/')

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
  await expect(page.getByRole('link', { name: 'Toys & Games' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Kitchen & Home' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Gifts under ₹499' })).toBeVisible()

  // Footer
  await expect(page.getByRole('contentinfo').getByText('Daily finds • Home • Toys')).toBeVisible()

  // Floating WhatsApp button is the last thing proven on screen
  await expect(page.getByRole('link', { name: 'Chat on WhatsApp' })).toBeVisible()
})
