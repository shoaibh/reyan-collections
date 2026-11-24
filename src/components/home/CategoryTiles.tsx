import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { resolveImage } from '@/lib/media'
import type { Category } from '@/payload-types'

// White text only on cobalt/tomato, and only at >= 18.66px bold (the h3). Never white on mint/sun/pink.
const tones: Record<Category['tileColor'], { bg: string; text: string; onDark: boolean }> = {
  cobalt: { bg: 'bg-cobalt', text: 'text-white', onDark: true },
  tomato: { bg: 'bg-tomato', text: 'text-white', onDark: true },
  mint: { bg: 'bg-mint', text: 'text-ink', onDark: false },
  sun: { bg: 'bg-sun', text: 'text-ink', onDark: false },
  pink: { bg: 'bg-pink', text: 'text-ink', onDark: false },
}

export function CategoryTiles({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null
  return (
    <section aria-labelledby="cats-h" className="px-[18px] pt-10 md:px-12 md:pt-16">
      <h2 id="cats-h" className="mb-4 text-[30px] font-extrabold tracking-[-0.04em] md:mb-6 md:text-[46px]">
        Shop by what you need
      </h2>
      <div className="grid grid-cols-2 gap-3 md:gap-[26px]">
        {categories.map((cat) => {
          const tone = tones[cat.tileColor] ?? tones.mint
          const image = resolveImage(cat.image, 'thumb', cat.title)
          return (
            <Link
              key={cat.id}
              href={`/c/${cat.slug}`}
              className={`flex flex-col rounded-[20px] border-[3px] border-ink p-3.5 shadow-[4px_4px_0_var(--color-ink)] md:min-h-[220px] md:flex-row-reverse md:items-center md:justify-between md:rounded-[28px] md:px-8 md:py-7 md:shadow-[6px_6px_0_var(--color-ink)] ${tone.bg} ${tone.text}`}
            >
              {image && (
                <div className="relative mb-2.5 size-[84px] flex-none overflow-hidden rounded-full border-[3px] border-ink bg-white md:mb-0 md:size-[170px]">
                  <Image src={image.src} alt={image.alt} fill sizes="170px" className="object-cover" />
                </div>
              )}
              <div>
                <h3 className="mb-1.5 text-[21px] font-extrabold tracking-[-0.04em] md:text-[42px]">{cat.title}</h3>
                {cat.description && (
                  <p
                    className={`mb-3 text-xs leading-snug md:mb-[18px] md:text-base ${
                      tone.onDark ? 'inline-block rounded-md bg-butter px-1.5 py-0.5 text-ink' : ''
                    }`}
                  >
                    {cat.description}
                  </p>
                )}
                <span className="block w-fit rounded-full border-[2.5px] border-ink bg-white px-[11px] py-[5px] text-xs font-bold text-ink md:px-4 md:py-2 md:text-[15px]">
                  Explore →
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
