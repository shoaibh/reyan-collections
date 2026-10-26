import { describe, expect, it } from 'vitest'

import { assertSeedAllowed } from '@/seed/guard'

const uri = (db: string) => `postgres://user@localhost:5432/${db}`

describe('assertSeedAllowed', () => {
  it('allows reyan_dev and reyan_test outside production', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'development', DATABASE_URI: uri('reyan_dev') })).not.toThrow()
    expect(() => assertSeedAllowed({ DATABASE_URI: uri('reyan_test') })).not.toThrow()
  })

  it('refuses other database names, naming the database and the override', () => {
    expect(() => assertSeedAllowed({ DATABASE_URI: uri('reyan') })).toThrow(/"reyan".*SEED_FORCE=1/s)
    expect(() => assertSeedAllowed({ DATABASE_URI: uri('railway') })).toThrow(/"railway"/)
  })

  it('refuses production unless SEED_FORCE=1', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production', DATABASE_URI: uri('reyan_dev') })).toThrow(
      /SEED_FORCE=1/,
    )
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', SEED_FORCE: '1', DATABASE_URI: uri('reyan') }),
    ).not.toThrow()
  })

  it('refuses a missing or unparseable URI', () => {
    expect(() => assertSeedAllowed({})).toThrow(/DATABASE_URI/)
    expect(() => assertSeedAllowed({ DATABASE_URI: 'not a uri' })).toThrow(/SEED_FORCE=1/)
  })
})
