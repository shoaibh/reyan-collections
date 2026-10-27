'use client'

import { useEffect, useMemo, useState } from 'react'

import type { CartLineInfo } from '@/app/(frontend)/api/cart-lines/route'
import type { CartLine } from '@/lib/cart'

export type CartLinesState =
  | { status: 'idle' | 'loading' | 'error'; info: Record<string, CartLineInfo> }
  | { status: 'ready'; info: Record<string, CartLineInfo> }

export const lineKey = (productId: number, variantId: string) => `${productId}:${variantId}`

/**
 * Resolves cart lines against live published data whenever `active` flips on or the set of
 * products and variants changes (quantity changes do not refetch).
 */
export function useCartLines(lines: CartLine[], active: boolean): CartLinesState {
  const items = useMemo(() => lines.map((l) => lineKey(l.productId, l.variantId)).join(','), [lines])
  const [result, setResult] = useState<{ items: string; info: Record<string, CartLineInfo> | null }>({
    items: '',
    info: null,
  })

  useEffect(() => {
    if (!active || !items) return
    const controller = new AbortController()
    fetch(`/api/cart-lines?items=${encodeURIComponent(items)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<CartLineInfo[]>) : null))
      .then((body) => {
        setResult({
          items,
          info: body ? Object.fromEntries(body.map((b) => [lineKey(b.productId, b.variantId), b])) : null,
        })
      })
      .catch(() => {
        // an aborted request is superseded; a real failure shows as an error below
        if (!controller.signal.aborted) setResult({ items, info: null })
      })
    return () => controller.abort()
  }, [active, items])

  if (!items) return { status: 'ready', info: {} }
  if (result.items !== items) return { status: active ? 'loading' : 'idle', info: {} }
  return result.info ? { status: 'ready', info: result.info } : { status: 'error', info: {} }
}
