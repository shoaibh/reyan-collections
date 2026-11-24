import Link from 'next/link'
import React from 'react'

import { getNavigation } from '@/lib/data/globals'
import { resolveNavLinks } from '@/lib/nav'

import { BrandLockup } from './BrandLockup'
import { CartButton } from './CartButton'
import { MobileMenu } from './MobileMenu'

export async function Header() {
  const navigation = await getNavigation()
  const links = resolveNavLinks(navigation.items)

  return (
    <header className="relative flex items-center justify-between px-[18px] py-3.5 md:px-12 md:py-[22px]">
      <BrandLockup />
      <nav aria-label="Main" className="mx-6 hidden gap-[26px] text-base font-semibold md:flex">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded underline-offset-4 hover:underline">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2 md:gap-3">
        <form action="/shop" method="get" role="search" className="hidden md:block">
          <input
            type="search"
            maxLength={80}
            name="q"
            placeholder="Search…"
            aria-label="Search products"
            className="w-[200px] rounded-full border-[2.5px] border-ink bg-white px-[18px] py-2.5 text-sm text-ink placeholder:text-softer"
          />
        </form>
        <Link
          href="/shop"
          aria-label="Search products"
          className="flex size-[38px] items-center justify-center rounded-full border-[2.5px] border-ink bg-white md:hidden"
        >
          <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
            <circle cx="7.2" cy="7.2" r="4.8" fill="none" stroke="#1E1B4B" strokeWidth="2" />
            <path d="M11 11l4 4" stroke="#1E1B4B" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </Link>
        <CartButton />
        <MobileMenu links={links} />
      </div>
    </header>
  )
}
