import Link from 'next/link'
import React from 'react'

import { getStoreSettings } from '@/lib/data/globals'

const policyLinks = [
  { href: '/shipping-policy', label: 'Shipping' },
  { href: '/return-policy', label: 'Returns' },
  { href: '/privacy-policy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
]

const linkClass = 'rounded underline-offset-4 hover:underline'

export async function Footer() {
  const settings = await getStoreSettings()
  const business = settings.business
  const social = settings.social

  const addr = business?.address
  const address = [addr?.line1, addr?.line2, addr?.city, addr?.state, addr?.pincode]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')

  const external = [
    { href: social?.instagramUrl, label: 'Instagram' },
    { href: social?.amazonStoreUrl, label: 'Amazon' },
    { href: social?.flipkartStoreUrl, label: 'Flipkart' },
    { href: social?.meeshoStoreUrl, label: 'Meesho' },
  ].filter((l): l is { href: string; label: string } => Boolean(l.href?.trim()))

  return (
    <footer className="mt-10 flex flex-col justify-between gap-3 border-t border-butter/20 bg-ink px-[18px] pt-6 pb-10 text-[12.5px] leading-relaxed text-butter/85 md:flex-row md:px-12 md:pt-7 md:pb-9 md:text-sm">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-circle.jpg"
          alt=""
          width={84}
          height={84}
          className="size-16 flex-none rounded-full border-[3px] border-butter md:size-[84px]"
        />
        <div>
          <b className="text-butter">{business?.name || 'Reyan Collections'}</b>
          <br />
          Daily finds • Home • Toys
          {business?.gstin?.trim() && (
            <>
              <br />
              GSTIN: {business.gstin}
            </>
          )}
          {address && (
            <>
              <br />
              {address}
            </>
          )}
        </div>
      </div>
      <div className="md:text-right">
        <nav aria-label="Policies" className="flex flex-wrap gap-x-3 gap-y-1 md:justify-end">
          {policyLinks.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </nav>
        {external.length > 0 && (
          <nav aria-label="Social and marketplaces" className="mt-1 flex flex-wrap gap-x-3 gap-y-1 md:justify-end">
            {external.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {l.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </footer>
  )
}
