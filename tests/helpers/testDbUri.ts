import 'dotenv/config'

/**
 * The database every test run uses: TEST_DATABASE_URI if set, otherwise DATABASE_URI
 * with its database name replaced by `reyan_test`.
 */
export function testDbUri(): string {
  if (process.env.TEST_DATABASE_URI) return process.env.TEST_DATABASE_URI
  const base = process.env.DATABASE_URI
  if (!base) throw new Error('Set TEST_DATABASE_URI or DATABASE_URI so the test database can be resolved')
  const url = new URL(base)
  url.pathname = '/reyan_test'
  return url.toString()
}
