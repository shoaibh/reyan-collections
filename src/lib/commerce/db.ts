import type { PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

type SQL = ReturnType<typeof sql>

export type SqlExecutor = { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> }

/**
 * The drizzle instance to run raw SQL on: the open transaction's when `transactionID` resolves
 * to one (so the query sees and joins the request's writes), otherwise the shared pool.
 */
export async function drizzleFor(
  payload: Payload,
  transactionID?: string | number | Promise<string | number> | null,
): Promise<SqlExecutor> {
  const adapter = payload.db as unknown as PostgresAdapter
  const id = transactionID ? await transactionID : undefined
  const session = id !== undefined ? adapter.sessions[id] : undefined
  return (session?.db ?? adapter.drizzle) as unknown as SqlExecutor
}

export type Tx = {
  transactionID: string | number
  db: SqlExecutor
  req: { transactionID: string | number }
}

/** Begin → fn → commit; on a throw, roll back and rethrow. Pass `tx.req` to Local API calls to join it. */
export async function withTransaction<T>(payload: Payload, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null || transactionID === undefined) {
    throw new Error('Database transactions are not supported by this adapter')
  }
  try {
    const result = await fn({
      transactionID,
      db: await drizzleFor(payload, transactionID),
      req: { transactionID },
    })
    await payload.db.commitTransaction(transactionID)
    return result
  } catch (err) {
    await payload.db.rollbackTransaction(transactionID)
    throw err
  }
}
