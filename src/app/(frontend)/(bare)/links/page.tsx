import type { Metadata } from 'next'
import React from 'react'

import { LinkButton } from '@/components/links/LinkButton'
import { getLinksPage } from '@/lib/data/globals'

export const metadata: Metadata = { title: 'Links' }

export default async function LinksPage() {
  const links = await getLinksPage()
  const buttons = (links.buttons ?? []).filter((b) => b.enabled !== false)

  return (
    <div className="relative mx-auto min-h-screen max-w-[480px] overflow-hidden px-[22px] pt-[34px] pb-10 text-center">
      <div
        aria-hidden="true"
        className="absolute top-[250px] -right-[120px] size-[220px] bg-tomato"
        style={{ borderRadius: '42% 58% 63% 37% / 41% 44% 56% 59%' }}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[120px] -left-[60px] size-[140px] rounded-full border-[3px] border-ink bg-sun"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-circle.jpg"
        alt="Reyan Collections logo"
        width={150}
        height={150}
        className="relative mx-auto mt-3 mb-3.5 block size-[150px] rounded-full border-[3px] border-ink shadow-[5px_5px_0_var(--color-ink)]"
      />
      <h1 className="relative text-[27px] font-extrabold tracking-[-0.035em]">Reyan Collections</h1>
      {links.tagline && (
        <p className="relative mt-2 mb-[18px] inline-block -rotate-2 rounded-full border-[2.5px] border-ink bg-pink px-3 py-1 text-[12.5px] font-extrabold">
          {links.tagline}
        </p>
      )}
      <div className="relative">
        {buttons.map((b) => (
          <LinkButton key={b.id ?? b.label} label={b.label} url={b.url} iconType={b.iconType} highlight={b.highlight} />
        ))}
      </div>
      <p className="relative mt-[18px] text-[11.5px] text-softer">GST-registered business · Ships across India</p>
    </div>
  )
}
