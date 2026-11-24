import type { Media } from '@/payload-types'

export type MediaSize = 'thumb' | 'card' | 'hero'

export type ResolvedImage = { src: string; alt: string }

/** Picks a Payload media size (falling back to the original) from a populated media relation. */
export function resolveImage(
  media: number | Media | null | undefined,
  size: MediaSize,
  fallbackAlt: string,
): ResolvedImage | null {
  if (!media || typeof media !== 'object') return null
  const src = media.sizes?.[size]?.url || media.url
  if (!src) return null
  return { src, alt: media.alt?.trim() || fallbackAlt }
}
