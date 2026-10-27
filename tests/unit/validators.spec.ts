import { describe, expect, it } from 'vitest'

import { safeUrl } from '@/lib/validators'

const MSG = 'Use an https:// link or a site path like /shop'
const run = (v: string | null | undefined, required = false) =>
  (safeUrl as unknown as (v: unknown, o: { required?: boolean }) => unknown)(v, { required })

describe('safeUrl', () => {
  it('accepts https urls and site paths', () => {
    expect(run('https://amazon.in/x')).toBe(true)
    expect(run('/shop')).toBe(true)
    expect(run('/')).toBe(true)
    expect(run('https://wa.me/910000000000')).toBe(true)
  })
  it('rejects other schemes and protocol-relative urls', () => {
    expect(run('//evil.com')).toBe(MSG)
    expect(run('javascript:alert(1)')).toBe(MSG)
    expect(run('http://x.com')).toBe(MSG)
    expect(run('data:text/html,hi')).toBe(MSG)
  })
  it('accepts empty unless required', () => {
    expect(run('')).toBe(true)
    expect(run(undefined)).toBe(true)
    expect(run('', true)).toBe('This field is required.')
  })
})
