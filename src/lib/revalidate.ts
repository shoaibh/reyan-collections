import { revalidateTag } from 'next/cache'

/**
 * Invalidate storefront cache tags. Outside a Next runtime (vitest, the seed, `payload run`)
 * there is no incremental cache, so the call throws; that is swallowed on purpose.
 */
export function revalidate(tags: string[]): void {
  for (const tag of new Set(tags)) {
    try {
      revalidateTag(tag, { expire: 0 })
    } catch {
      // not running inside Next
    }
  }
}
