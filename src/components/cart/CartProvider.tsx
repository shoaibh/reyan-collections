'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { addLine, clampLines, count as countLines, parseCart, removeLine, setQty as setLineQty, type CartLine } from '@/lib/cart'

const STORAGE_KEY = 'rc-cart-v1'

type CartContextValue = {
  lines: CartLine[]
  add: (line: CartLine) => void
  setQty: (productId: number, variantId: string, qty: number) => void
  remove: (productId: number, variantId: string) => void
  count: number
  maxPerOrder: number
  open: boolean
  setOpen: (open: boolean) => void
}

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
    () => ({ lines, add, setQty, remove, count: countLines(lines), maxPerOrder, open, setOpen }),
    [lines, add, setQty, remove, maxPerOrder, open],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
