import Image from 'next/image'
import React from 'react'

import { PriceTag } from '@/components/product/PriceTag'
import { Sticker } from '@/components/product/Sticker'
import { Button } from '@/components/ui/Button'
import { showComparison } from '@/lib/commerce/product'
import { resolveImage } from '@/lib/media'
import type { Homepage, Product, StoreSetting } from '@/payload-types'

const marketplaceLabel = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho' } as const

function publishedProduct(p: number | Product | null | undefined): Product | null {
  return p && typeof p === 'object' ? p : null
}

function Headline({ text, highlight }: { text: string; highlight?: string | null }) {
  const word = highlight?.trim()
  const at = word ? text.indexOf(word) : -1
  if (!word || at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span className="inline-block -rotate-3 rounded-[0.18em] border-[3px] border-ink bg-mint px-[0.16em] text-ink">
        {word}
      </span>
      {text.slice(at + word.length)}
    </>
  )
}

export function Hero({
  hero,
  ratings,
}: {
  hero: Homepage['hero']
  ratings: NonNullable<StoreSetting['social']>['ratings']
}) {
  const productA = publishedProduct(hero.productA)
  const productB = publishedProduct(hero.productB)
  const imageA =
    resolveImage(hero.imageOverrideA, 'hero', productA?.title ?? '') ??
    (productA ? resolveImage(productA.images?.[0], 'hero', productA.title) : null)
  const imageB =
    resolveImage(hero.imageOverrideB, 'hero', productB?.title ?? '') ??
    (productB ? resolveImage(productB.images?.[0], 'hero', productB.title) : null)
  const compareA = productA && showComparison(productA) ? productA.compareAt : null

  const rated = (['amazon', 'flipkart', 'meesho'] as const).flatMap((m) => {
    const value = ratings?.[m]
    return typeof value === 'number' && value > 0 ? [{ label: marketplaceLabel[m], value }] : []
  })

  const showVisual = Boolean(productA)

  return (
    <section
      className={`px-[18px] pt-2.5 pb-6 md:px-12 md:pt-[30px] md:pb-[60px] ${
        showVisual ? 'md:grid md:grid-cols-[1.05fr_1fr] md:items-center md:gap-10' : ''
      }`}
    >
      <div>
        {hero.pill && (
          <span className="inline-block -rotate-2 rounded-full border-[2.5px] border-ink bg-white px-[13px] py-1.5 text-[12.5px] font-bold shadow-pop-sm md:px-4 md:py-[7px] md:text-sm">
            ✦ {hero.pill}
          </span>
        )}
        <h1 className="mt-4 mb-3 text-[43px] leading-[0.98] font-extrabold tracking-[-0.045em] md:mt-[22px] md:mb-[18px] md:text-[76px]">
          <Headline text={hero.headline} highlight={hero.highlightWord} />
        </h1>
        {hero.subtext && (
          <p className="mb-5 max-w-[520px] text-[15.5px] leading-normal text-soft md:mb-7 md:text-[19px]">
            {hero.subtext}
          </p>
        )}
        <div className="mb-4 flex flex-col gap-3 md:mb-[22px] md:flex-row md:gap-3.5">
          {hero.ctaPrimary?.label && hero.ctaPrimary.link && (
            <Button href={hero.ctaPrimary.link} variant="blue">
              {hero.ctaPrimary.label}
            </Button>
          )}
          {hero.ctaSecondary?.label && hero.ctaSecondary.link && (
            <Button href={hero.ctaSecondary.link} variant="white">
              {hero.ctaSecondary.label}
            </Button>
          )}
        </div>
        {rated.length > 0 && (
          <p className="text-[13px] text-soft md:text-[15px]">
            <span aria-hidden="true" className="tracking-[2px] text-tomato-deep">
              ★
            </span>{' '}
            {rated.map((r, i) => (
              <React.Fragment key={r.label}>
                {i > 0 && ' · '}
                <b>{r.value}</b> on {r.label}
              </React.Fragment>
            ))}
          </p>
        )}
      </div>

      {showVisual && (
        <div data-testid="hero-visual" className="relative mt-2 h-[330px] md:mt-0 md:h-[520px]">
          <div
            aria-hidden="true"
            className="absolute top-5 right-0 size-[270px] rounded-[42%_58%_63%_37%/41%_44%_56%_59%] bg-tomato md:top-[30px] md:right-[30px] md:size-[430px]"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-1.5 left-1 size-20 rounded-full border-[3px] border-ink bg-sun md:bottom-[30px] md:left-0 md:size-[140px]"
          />
          {imageA && (
            <div className="absolute top-9 right-[22px] size-[220px] rotate-3 overflow-hidden rounded-[20px] border-[3px] border-ink bg-white shadow-[6px_6px_0_var(--color-ink)] md:top-[50px] md:right-[70px] md:size-[350px] md:rounded-[26px] md:shadow-pop-lg">
              <Image
                src={imageA.src}
                alt={imageA.alt}
                fill
                preload
                sizes="(min-width: 768px) 350px, 220px"
                className="object-cover"
              />
            </div>
          )}
          {imageB && (
            <div className="absolute top-[150px] left-3.5 h-[150px] w-[118px] -rotate-6 overflow-hidden rounded-[20px] border-[3px] border-ink bg-white shadow-[6px_6px_0_var(--color-ink)] md:top-[230px] md:left-10 md:h-60 md:w-[190px] md:rounded-[26px] md:shadow-pop-lg">
              <Image
                src={imageB.src}
                alt={imageB.alt}
                fill
                sizes="(min-width: 768px) 190px, 118px"
                className="object-cover"
              />
            </div>
          )}
          {hero.stickerText && (
            <Sticker className="absolute top-4 right-1.5 z-[3] md:top-7 md:right-10">{hero.stickerText}</Sticker>
          )}
          {productA && compareA?.price && (
            <PriceTag
              price={productA.price}
              compare={compareA.price}
              marketplace={compareA.marketplace ? marketplaceLabel[compareA.marketplace] : 'Amazon'}
              className="absolute right-1 bottom-1.5 z-[3] md:right-5 md:bottom-[30px]"
            />
          )}
        </div>
      )}
    </section>
  )
}
