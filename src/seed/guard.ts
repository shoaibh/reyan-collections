type SeedEnv = { NODE_ENV?: string; SEED_FORCE?: string; DATABASE_URI?: string }

const databaseName = (uri: string | undefined): string | undefined => {
  if (!uri) return undefined
  try {
    const name = decodeURIComponent(new URL(uri).pathname.replace(/^\//, ''))
    return name || undefined
  } catch {
    return undefined
  }
}

/** The seed wipes catalog data, so it only runs against `_dev` / `_test` databases unless forced. */
export function assertSeedAllowed(env: SeedEnv): void {
  if (env.SEED_FORCE === '1') return
  const name = databaseName(env.DATABASE_URI)
  const safeName = name !== undefined && /_(dev|test)$/.test(name)
  if (env.NODE_ENV !== 'production' && safeName) return
  const target = name ? `database "${name}"` : 'an unknown database (DATABASE_URI missing or unparseable)'
  throw new Error(
    `Refusing to seed ${target}${env.NODE_ENV === 'production' ? ' in production' : ''}: the seed deletes data. ` +
      'Only databases ending in _dev or _test outside production are allowed. Set SEED_FORCE=1 to override.',
  )
}
