import { test, expect } from '@playwright/test'

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
  await expect(page.locator('span[title="Dashboard"]')).toBeVisible()

  // Products list shows the seeded product
  await page.goto('/admin/collections/products')
  const row = page.getByText('Mexico premium container, set of 2')
  await expect(row).toBeVisible()
  await row.click()

  // Both colour variants are present
  await expect(page.locator('input[name="variants.0.name"]')).toHaveValue('Mint')
  await expect(page.locator('input[name="variants.1.name"]')).toHaveValue('Sand')

  // Later specs read the seeded stock (Sand 3), so put it back whatever happens below
  const restoreSand = async () => {
    const login = await request.post('/api/users/login', { data: { email, password } })
    const { token } = (await login.json()) as { token: string }
    const headers = { Authorization: `JWT ${token}` }
    const found = await request.get(
      '/api/products?where[slug][equals]=mexico-premium-container-set-of-2&depth=0&draft=false',
      { headers },
    )
    type Variant = { id: string; name: string; stock: number }
    const doc = ((await found.json()) as { docs: { id: number; variants: Variant[] }[] }).docs[0]
    // The variants array is replaced as a whole, so send every row
    const variants = doc.variants.map((v) => (v.name === 'Sand' ? { ...v, stock: 3 } : v))
    const res = await request.patch(`/api/products/${doc.id}`, {
      headers,
      data: { variants, _status: 'published' },
    })
    expect(res.ok()).toBeTruthy()
  }

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
