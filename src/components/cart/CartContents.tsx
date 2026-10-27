'use client'

import Link from 'next/link'
import React from 'react'

import { useCart } from '@/components/cart/CartProvider'
import { CartLineItem, effectiveQty } from '@/components/cart/CartLineItem'
import { lineKey, useCartLines } from '@/components/cart/useCartLines'
import { formatINR } from '@/lib/format'

const primary =
  'rounded-2xl border-[3px] border-ink bg-cobalt px-6 py-3.5 text-center text-[19px] font-extrabold text-white shadow-[4px_4px_0_var(--color-ink)]'

/** The cart body shared by the drawer and the /cart page. */
export function CartContents({ active, onNavigate }: { active: boolean; onNavigate?: () => void }) {
  const cart = useCart()
  const { status, info } = useCartLines(cart.lines, active)

  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 p-5">
        <p className="text-xl font-extrabold">Your cart is empty</p>
        <Link
          href="/shop"
          onClick={onNavigate}
          className="rounded-2xl border-[3px] border-ink bg-sun px-5 py-3 text-lg font-extrabold text-ink shadow-[4px_4px_0_var(--color-ink)]"
        >
          Shop all products
        </Link>
      </div>
    )
  }

  if (status === 'error') {
    return <p className="p-5 font-bold">We couldn&apos;t load your cart. Please reload and try again.</p>
  }
  if (status !== 'ready') {
    return (
      <p role="status" className="p-5 font-bold text-softer">
        Loading your cart…
      </p>
    )
  }

  const rows = cart.lines.map((line) => {
    const data = info[lineKey(line.productId, line.variantId)]
    const live = data?.available && data.price !== null ? data : null
    const qty = live ? effectiveQty(line.qty, live.stock, cart.maxPerOrder) : 0
    return { line, data, qty, total: live && live.price !== null ? live.price * qty : 0 }
  })
  const subtotal = rows.reduce((sum, r) => sum + r.total, 0)
  const purchasable = rows.reduce((sum, r) => sum + r.qty, 0)

  return (
    <div className="flex flex-col gap-4 p-5">
      <ul className="flex flex-col gap-3">
        {rows.map(({ line, data }) =>
          data ? (
            <CartLineItem
              key={lineKey(line.productId, line.variantId)}
              info={data}
              qty={line.qty}
              maxPerOrder={cart.maxPerOrder}
              onQty={(qty) => cart.setQty(line.productId, line.variantId, qty)}
              onRemove={() => cart.remove(line.productId, line.variantId)}
              onNavigate={onNavigate}
            />
          ) : null,
        )}
      </ul>
      <div className="flex flex-col gap-1 border-t-[3px] border-ink pt-4">
        <p className="flex items-baseline justify-between text-xl font-extrabold">
          <span>Subtotal</span>
          <span data-testid="cart-subtotal">{formatINR(subtotal)}</span>
        </p>
        <p className="text-sm text-softer">Prices include GST · Shipping calculated at checkout</p>
      </div>
      {purchasable > 0 ? (
        <Link href="/checkout" onClick={onNavigate} className={primary}>
          Checkout
        </Link>
      ) : (
        <span aria-disabled="true" className={`${primary} bg-white text-softer shadow-none`}>
          Checkout
        </span>
      )}
    </div>
  )
}
