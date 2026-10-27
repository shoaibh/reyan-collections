'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { lineKey, useCartLines } from '@/components/cart/useCartLines'
import { addLine, clampLines, count as countLines, parseCart, removeLine, setQty as setLineQty, type CartLine } from '@/lib/cart'

const STORAGE_KEY = 'rc-cart-v1'

type CartContextValue = {
  lines: CartLine[]
  add: (line: CartLine) => void
  setQty: (productId: number, variantId: string, qty: number) => void
  remove: (productId: number, variantId: string) => void
  count: number
  maxPerOrder: number
  /** Notices for lines clamped after live data resolved, keyed `productId:variantId` */
  notices: Record<string, string>
  open: boolean
  setOpen: (open: boolean) => void
}

export const clampNotice = (qty: number, stock: number, maxPerOrder: number) =>
  qty > stock
    ? `Only ${stock} left; we updated your quantity`
    : `Max ${maxPerOrder} per order; we updated your quantity`

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({
  children,
  maxPerOrder = 5,
}: {
  children: React.ReactNode
  maxPerOrder?: number
}) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [notices, setNotices] = useState<Record<string, string>>({})
  const live = useCartLines(lines, loaded)

  // Once live data resolves, write clamped quantities back. Unavailable lines stay until removed.
  useEffect(() => {
    if (live.status !== 'ready') return
    const found: Record<string, string> = {}
    const clamped = lines.map((l) => {
      const data = live.info[lineKey(l.productId, l.variantId)]
      if (!data?.available) return l
      const qty = Math.min(l.qty, data.stock, maxPerOrder)
      if (qty < l.qty) found[lineKey(l.productId, l.variantId)] = clampNotice(l.qty, data.stock, maxPerOrder)
      return qty < l.qty ? { ...l, qty } : l
    })
    if (Object.keys(found).length === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotices((prev) => ({ ...prev, ...found }))
    setLines(clamped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, maxPerOrder])

  // The badge counts what can be bought: unavailable lines are excluded
  const badge = useMemo(
    () =>
      countLines(
        lines.filter((l) => live.status !== 'ready' || live.info[lineKey(l.productId, l.variantId)]?.available !== false),
      ),
    [lines, live],
  )

  // Load after mount so server and first client render agree (an empty cart).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLines(clampLines(parseCart(window.localStorage.getItem(STORAGE_KEY)), maxPerOrder))
    } catch {
      // storage unavailable: start empty
    }
    setLoaded(true)
  }, [maxPerOrder])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // storage unavailable: the cart lives in memory only
    }
  }, [lines, loaded])

  const add = useCallback(
    (line: CartLine) => setLines((prev) => addLine(prev, line, maxPerOrder)),
    [maxPerOrder],
  )
  const setQty = useCallback(
    (productId: number, variantId: string, qty: number) =>
      setLines((prev) => setLineQty(prev, productId, variantId, qty, maxPerOrder)),
    [maxPerOrder],
  )
  const remove = useCallback(
    (productId: number, variantId: string) => setLines((prev) => removeLine(prev, productId, variantId)),
    [],
  )

  const value = useMemo<CartContextValue>(
    () => ({ lines, add, setQty, remove, count: badge, maxPerOrder, notices, open, setOpen }),
    [lines, add, setQty, remove, badge, maxPerOrder, notices, open],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
