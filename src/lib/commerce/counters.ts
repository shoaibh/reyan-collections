import { sql } from '@payloadcms/db-postgres'

import type { SqlExecutor } from './db'

/** Gapless when called inside the transaction that uses the number: a rollback undoes the bump. */
export async function nextNumber(db: SqlExecutor, key: string, start: number): Promise<number> {
  const res = await db.execute(
    sql`INSERT INTO counters (key, last_number) VALUES (${key}, ${start + 1}) ON CONFLICT (key) DO UPDATE SET last_number = counters.last_number + 1, updated_at = now() RETURNING last_number`,
  )
  return Number(res.rows[0]!.last_number)
}

export const formatOrderNumber = (n: number): string => `RC${n}`
