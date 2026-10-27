import Link from 'next/link'
import React from 'react'

export function BrandLockup({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-[0.32em] rounded-lg text-[19px] font-extrabold tracking-[-0.04em] text-ink md:text-[30px] ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-mark.png"
        alt=""
        className="h-[1.55em] w-auto mix-blend-multiply"
        height={46}
        width={46}
      />
      <span>Reyan Collections</span>
    </Link>
  )
}
