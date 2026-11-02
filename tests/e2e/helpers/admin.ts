import { expect, type APIRequestContext, type Page } from '@playwright/test'

import { login } from '../../helpers/login'

/** Logs in through the admin login page and waits for the Today view (wraps the shared login helper). */
export async function adminLogin(page: Page) {
  await login({
    page,
    user: {
      email: process.env.SEED_ADMIN_EMAIL as string,
      password: process.env.SEED_ADMIN_PASSWORD as string,
    },
  })
}

/** Logs in through Payload's REST API and returns the JWT, for `Authorization: JWT <token>` calls. */
export async function adminToken(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/users/login', {
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { token: string }).token
}
