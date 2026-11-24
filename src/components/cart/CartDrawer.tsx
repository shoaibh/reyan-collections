'use client'

import React, { useEffect, useRef } from 'react'

import { CartContents } from '@/components/cart/CartContents'
import { useCart } from '@/components/cart/CartProvider'

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function CartDrawer() {
  const { open, setOpen } = useCart()
  const sheet = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !sheet.current) return
      const items = Array.from(sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getAttribute('aria-disabled') !== 'true',
      )
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const current = document.activeElement
      if (!sheet.current.contains(current)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      document.querySelector<HTMLElement>('[data-cart-button]')?.focus()
    }
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/50" aria-hidden="true" onClick={() => setOpen(false)} />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        className="relative flex h-full w-full flex-col overflow-y-auto border-l-[3px] border-ink bg-butter shadow-[-6px_0_0_var(--color-ink)] md:w-[440px]"
      >
        <div className="flex items-center justify-between border-b-[3px] border-ink px-5 py-3.5">
          <h2 className="text-2xl font-extrabold">Your cart</h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close cart"
            onClick={() => setOpen(false)}
            className="grid size-11 place-items-center rounded-xl border-[3px] border-ink bg-white text-xl leading-none font-extrabold"
          >
            ×
          </button>
        </div>
        <CartContents active={open} onNavigate={() => setOpen(false)} />
      </div>
    </div>
  )
}
