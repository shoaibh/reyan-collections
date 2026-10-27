'use client'

import Link from 'next/link'
import React, { useEffect, useId, useState } from 'react'

import type { NavLink } from '@/lib/nav'

export function MobileMenu({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex size-[38px] items-center justify-center rounded-full border-[2.5px] border-ink bg-white text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d={open ? 'M3 3l12 12M15 3L3 15' : 'M2 4h14M2 9h14M2 14h14'} stroke="#1E1B4B" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </svg>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full z-30 border-y-[2.5px] border-ink bg-butter px-[18px] py-4 shadow-pop"
      >
        <nav aria-label="Main" className="flex flex-col gap-1 text-lg font-semibold">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-2 py-2.5">
              {l.label}
            </Link>
          ))}
        </nav>
        <form action="/shop" method="get" role="search" className="mt-3 flex gap-2">
          <input
            type="search"
            name="q"
            placeholder="Search…"
            aria-label="Search products"
            className="min-w-0 flex-1 rounded-full border-[2.5px] border-ink bg-white px-4 py-2.5 text-sm text-ink placeholder:text-softer"
          />
          <button type="submit" className="rounded-full border-[2.5px] border-ink bg-sun px-4 text-sm font-bold">
            Search
          </button>
        </form>
      </div>
    </div>
  )
}
