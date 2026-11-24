'use client'

import Image from 'next/image'
import React, { useRef, useState } from 'react'

export type GalleryImage = { src: string; thumb: string; alt: string }

/** Swipeable strip (scroll-snap) on a phone, with thumbnails that jump to a slide on desktop. */
export function Gallery({ images }: { images: GalleryImage[] }) {
  const strip = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  if (images.length === 0) return <div className="aspect-square rounded-[20px] border-[3px] border-ink bg-butter" />

  const goTo = (index: number) => {
    const el = strip.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div data-testid="gallery">
      <div
        ref={strip}
        onScroll={(e) => {
          const el = e.currentTarget
          setActive(Math.round(el.scrollLeft / el.clientWidth))
        }}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-[20px] border-[3px] border-ink bg-butter shadow-[4px_4px_0_var(--color-ink)] [scrollbar-width:none] md:shadow-pop [&::-webkit-scrollbar]:hidden"
      >
        {images.map((image, i) => (
          <div key={image.src} className="relative aspect-square w-full shrink-0 snap-center">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              priority={i === 0}
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
            {images.map((image, i) => (
              <span
                key={image.src}
                className={`size-2.5 rounded-full border-2 border-ink ${i === active ? 'bg-ink' : 'bg-white'}`}
              />
            ))}
          </div>
          <div className="mt-4 hidden gap-3 md:flex">
            {images.map((image, i) => (
              <button
                key={image.src}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === active ? 'true' : undefined}
                className={`relative size-[72px] overflow-hidden rounded-xl border-[3px] border-ink bg-butter ${
                  i === active ? 'shadow-pop-sm' : 'opacity-70'
                }`}
              >
                <Image src={image.thumb} alt="" fill sizes="72px" className="object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
