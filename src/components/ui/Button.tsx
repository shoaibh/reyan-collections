import Link from 'next/link'
import React from 'react'

const variants = {
  blue: 'bg-cobalt text-white',
  white: 'bg-white text-ink',
} as const

// 19px bold keeps white-on-cobalt text in the WCAG "large text" band
export function Button({
  href,
  variant,
  children,
}: {
  href: string
  variant: keyof typeof variants
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`inline-block rounded-[14px] border-[3px] border-ink px-[26px] py-[13px] text-center text-[19px] font-extrabold shadow-[4px_4px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 md:rounded-2xl md:py-3.5 md:shadow-pop ${variants[variant]}`}
    >
      {children}
    </Link>
  )
}
