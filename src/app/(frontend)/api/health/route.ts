import { sql } from '@payloadcms/db-postgres'

import { drizzleFor } from '@/lib/commerce/db'
import { getClient } from '@/lib/data/getPayloadClient'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'no-store' }

/** Railway's health check: 200 only when the app can reach the database. No error detail is ever returned. */
export async function GET() {
  try {
    const payload = await getClient()
    await (await drizzleFor(payload)).execute(sql`select 1`)
    return Response.json({ ok: true }, { headers })
  } catch {
    return Response.json({ ok: false }, { status: 503, headers })
  }
}
