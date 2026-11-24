import type { Payload } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getEmail } from '@/lib/integrations/email'
import { integrationMode } from '@/lib/integrations/mode'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const msg = { to: 'a@b.c', subject: 'Hi', html: '<p>x</p>', tag: 'order_paid' as const, orderNumber: 'RC1001' }

describe('integrationMode EMAIL', () => {
  it('honours live and mock', () => {
    vi.stubEnv('EMAIL_MODE', 'live')
    expect(integrationMode('EMAIL')).toBe('live')
    vi.stubEnv('EMAIL_MODE', 'mock')
    expect(integrationMode('EMAIL')).toBe('mock')
  })

  it('defaults to mock outside production and fails closed in production', () => {
    vi.stubEnv('EMAIL_MODE', '')
    vi.stubEnv('NODE_ENV', 'development')
    expect(integrationMode('EMAIL')).toBe('mock')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => integrationMode('EMAIL')).toThrow('Set EMAIL_MODE to live or mock')
  })

  it('rejects unknown values', () => {
    vi.stubEnv('EMAIL_MODE', 'maybe')
    expect(() => integrationMode('EMAIL')).toThrow('EMAIL_MODE must be live or mock')
  })
})

describe('email mock', () => {
  it('writes a dev-emails doc and logs without the html', async () => {
    vi.stubEnv('EMAIL_MODE', 'mock')
    const create = vi.fn(async () => ({}))
    const info = vi.fn()
    await getEmail({ create, logger: { info } } as unknown as Payload).send(msg)
    expect(create).toHaveBeenCalledWith({ collection: 'dev-emails', data: msg })
    expect(info).toHaveBeenCalledWith({ to: 'a@b.c', subject: 'Hi' }, 'Email (mock)')
  })
})

describe('email live', () => {
  const live = () => {
    vi.stubEnv('EMAIL_MODE', 'live')
    vi.stubEnv('RESEND_API_KEY', 're_key')
    vi.stubEnv('EMAIL_FROM', 'Reyan <orders@example.com>')
  }

  it('throws when env is missing', () => {
    vi.stubEnv('EMAIL_MODE', 'live')
    vi.stubEnv('RESEND_API_KEY', '')
    expect(() => getEmail({} as Payload)).toThrow()
  })

  it('posts to Resend with the bearer key', async () => {
    live()
    const fetchMock = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await getEmail({} as Payload).send(msg)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key')
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Reyan <orders@example.com>',
      to: ['a@b.c'],
      subject: 'Hi',
      html: '<p>x</p>',
    })
  })

  it('throws with the status on a 422', async () => {
    live()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 422 })))
    await expect(getEmail({} as Payload).send(msg)).rejects.toThrow(/422/)
  })
})
