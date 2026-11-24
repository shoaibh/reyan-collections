import { after } from 'next/server'

/**
 * Runs `task` after the response has been sent, so slow work (email, WhatsApp) never delays the customer.
 * Outside a request scope (Vitest, jobs, seed) `after` throws, so the task is awaited instead.
 * Anything that escapes the task is logged and never rethrown.
 */
export async function afterResponse(task: () => Promise<unknown>): Promise<void> {
  const run = async () => {
    try {
      await task()
    } catch (err) {
      console.error('Task after response failed', err)
    }
  }
  try {
    after(run)
  } catch {
    await run()
  }
}
