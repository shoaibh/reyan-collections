import { expect, type APIRequestContext } from '@playwright/test'

type Row = Record<string, unknown> & { name: string; stock: number }

/**
 * Sets one variant's stock through the REST API (as the seed admin) and returns a function that
 * restores the exact original variant rows. Payload replaces the whole `variants` array, so every
 * row is sent back in full (depth=0 keeps image ids), with only `stock` changed.
 */
export async function setVariantStock(
  request: APIRequestContext,
  slug: string,
  variantName: string,
  stock: number,
): Promise<() => Promise<void>> {
  const login = await request.post('/api/users/login', {
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  })
  expect(login.ok()).toBeTruthy()
  const { token } = (await login.json()) as { token: string }
  const headers = { Authorization: `JWT ${token}` }

  const found = await request.get(
    `/api/products?where[slug][equals]=${encodeURIComponent(slug)}&depth=0&draft=false`,
    { headers },
  )
  expect(found.ok()).toBeTruthy()
  const product = ((await found.json()) as { docs: { id: number; variants: Row[] }[] }).docs[0]
  expect(product).toBeTruthy()
  // stockAtLoad is a virtual echo of the loaded stock; sending it would make a save look untouched
  const original = product.variants.map((row) => {
    const { stockAtLoad: _ignored, ...rest } = row
    void _ignored
    return rest as Row
  })
  expect(original.some((r) => r.name === variantName)).toBe(true)

  const write = async (variants: Row[]) => {
    const res = await request.patch(`/api/products/${product.id}`, {
      headers,
      data: { variants, _status: 'published' },
    })
    expect(res.ok()).toBeTruthy()
  }

  await write(original.map((r) => (r.name === variantName ? { ...r, stock } : r)))
  return () => write(original)
}
