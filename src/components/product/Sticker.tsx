import React from 'react'

/** Pink rotated pill used for "Bestseller!" style labels. */
export function Sticker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-block rotate-[10deg] rounded-full border-[3px] border-ink bg-pink px-3 py-1.5 text-[13px] font-extrabold text-ink md:px-4 md:py-2 md:text-base ${className}`}
    >
      {children}
    </span>
  )
}
