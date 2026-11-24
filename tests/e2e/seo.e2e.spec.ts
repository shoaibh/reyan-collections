import { test, expect } from '@playwright/test'

test('search engines can crawl the shop', async ({ page, request }) => {
  // The sitemap lists the published container product
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.ok()).toBe(true)
  expect(await sitemap.text()).toContain('/p/mexico-premium-container-set-of-2')

  // Robots keeps crawlers out of the admin and checkout
  const robots = await request.get('/robots.txt')
  expect(robots.ok()).toBe(true)
  expect(await robots.text()).toContain('Disallow: /admin')

  // The product page ships schema.org Product data with the price in INR
  const product = await request.get('/p/mexico-premium-container-set-of-2')
  expect(product.ok()).toBe(true)
  const html = await product.text()
  expect(html).toContain('"priceCurrency":"INR"')
  expect(html).toContain('"price":449')
  // The page-level openGraph keeps the site name and falls back to the default image
  expect(html).toContain('og:site_name')

  // An unknown URL renders the branded not-found page
  await page.goto('/does-not-exist')
  await expect(page.getByRole('heading', { name: 'This page went out of stock' })).toBeVisible()

  // A multi-segment unknown URL (no route matches at all) is branded too
  await page.goto('/a/b')
  await expect(page.getByRole('heading', { name: 'This page went out of stock' })).toBeVisible()
})
