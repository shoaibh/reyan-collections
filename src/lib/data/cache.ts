import { unstable_cache } from 'next/cache'

/**
 * The single seam over Next's data cache. Outside a Next runtime (vitest, seed) there is no
 * incremental cache, so we fall back to calling `fn` directly.
 * Switching to `use cache` later is a change to this file only.
 */
export function cached<T>(fn: () => Promise<T>, key: string[], tags: string[]): () => Promise<T> {
  const wrapped = unstable_cache(fn, key, { tags })
  return async () => {
    try {
      return await wrapped()
    } catch (error) {
      if (error instanceof Error && /incrementalCache/i.test(error.message)) return fn()
      throw error
    }
  }
}
