'use client'

import React, { useEffect, useState } from 'react'

type StockMap = Record<string, number>

/** Reads live stock for one product on mount; `fallback` (the server value) shows until it lands. */
export function useLiveStock(productId: number, fallback: StockMap): StockMap {
  const [live, setLive] = useState<StockMap | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/stock?ids=${productId}`, { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<Record<string, StockMap>>) : null))
      .then((body) => {
        const stock = body?.[String(productId)]
        if (stock) setLive(stock)
      })
      .catch(() => {
        // keep the server value
      })
    return () => controller.abort()
  }, [productId])

  return live ? { ...fallback, ...live } : fallback
}

export function StockState({ stock }: { stock: number }) {
  if (stock <= 0) {
    return <p className="inline-block rounded-full border-2 border-ink bg-ink px-3 py-1 text-sm font-bold text-butter">Out of stock</p>
  }
  if (stock <= 3) {
    return <p className="inline-block rounded-full border-2 border-ink bg-sun px-3 py-1 text-sm font-bold text-ink">Only {stock} left</p>
  }
  return <p className="inline-block rounded-full border-2 border-ink bg-mint px-3 py-1 text-sm font-bold text-ink">In stock</p>
}
