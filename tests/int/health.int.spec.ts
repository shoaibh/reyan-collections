import { getPayload } from 'payload'
import config from '@/payload.config'

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/(frontend)/api/health/route'
import * as db from '@/lib/commerce/db'

describe('GET /api/health', () => {
  beforeAll(async () => {
    await getPayload({ config: await config })
  })
  afterEach(() => vi.restoreAllMocks())

  it('reports ok with no-store, and 503 without error detail when the database fails', async () => {
    const ok = await GET()
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(await ok.json()).toEqual({ ok: true })

    vi.spyOn(db, 'drizzleFor').mockRejectedValueOnce(new Error('password authentication failed for user secret'))
    const down = await GET()
    expect(down.status).toBe(503)
    expect(down.headers.get('cache-control')).toBe('no-store')
    const text = await down.text()
    expect(JSON.parse(text)).toEqual({ ok: false })
    expect(text).not.toContain('password')
  })
})
