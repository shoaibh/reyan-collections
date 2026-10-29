import { describe, expect, it } from 'vitest'

import { isSitePath, safeUrl } from '@/lib/validators'

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
  it('rejects backslashes and control characters browsers treat as slashes', () => {
    expect(run('/\\evil.com')).toBe(MSG)
    expect(run('/\t/evil.com')).toBe(MSG)
    expect(run('/\n/evil.com')).toBe(MSG)
    expect(run('/\r/evil.com')).toBe(MSG)
    expect(run('https://example.com/a\\b')).toBe(MSG)
  })
  it('still accepts normal paths and links', () => {
    expect(run('/shop')).toBe(true)
    expect(run('/p/a-b?x=1')).toBe(true)
    expect(run('https://wa.me/910000000000')).toBe(true)
  })
  it('accepts empty unless required', () => {
    expect(run('')).toBe(true)
    expect(run(undefined)).toBe(true)
    expect(run('', true)).toBe('This field is required.')
  })
})

describe('isSitePath', () => {
  it('is true only for single-slash paths without backslash or control characters', () => {
    expect(isSitePath('/shop')).toBe(true)
    expect(isSitePath('//evil.com')).toBe(false)
    expect(isSitePath('/\\evil.com')).toBe(false)
    expect(isSitePath('https://x.com')).toBe(false)
  })
})
