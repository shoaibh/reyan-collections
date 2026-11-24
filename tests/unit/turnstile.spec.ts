import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTurnstile, MOCK_TURNSTILE_TOKEN, turnstileClientConfig } from '@/lib/integrations/turnstile'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('turnstile mock', () => {
  it('passes any non-empty token except fail', async () => {
    const t = getTurnstile()
    expect(await t.verify(MOCK_TURNSTILE_TOKEN)).toBe(true)
    expect(await t.verify('fail')).toBe(false)
    expect(await t.verify('')).toBe(false)
    expect(turnstileClientConfig()).toEqual({ mode: 'mock', siteKey: null })
  })
})

describe('turnstile live', () => {
  it('throws when env is missing', () => {
    vi.stubEnv('TURNSTILE_MODE', 'live')
    vi.stubEnv('TURNSTILE_SITE_KEY', '')
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    expect(() => getTurnstile()).toThrow()
  })

  it('posts secret and response and returns false on success:false', async () => {
    vi.stubEnv('TURNSTILE_MODE', 'live')
    vi.stubEnv('TURNSTILE_SITE_KEY', 'site')
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'sekret')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await getTurnstile().verify('tok', '1.2.3.4')).toBe(false)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(init.method).toBe('POST')
    const body = init.body as URLSearchParams | FormData
    expect(body.get('secret')).toBe('sekret')
    expect(body.get('response')).toBe('tok')
    expect(body.get('remoteip')).toBe('1.2.3.4')
    expect(turnstileClientConfig()).toEqual({ mode: 'live', siteKey: 'site' })
  })

  it('returns true on success and false on network error', async () => {
    vi.stubEnv('TURNSTILE_MODE', 'live')
    vi.stubEnv('TURNSTILE_SITE_KEY', 'site')
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'sekret')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }))))
    expect(await getTurnstile().verify('tok')).toBe(true)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    expect(await getTurnstile().verify('tok')).toBe(false)
  })
})
