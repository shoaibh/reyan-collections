import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import React from 'react'

import { ProductBuyBox, type BuyBoxVariant } from '@/components/product/ProductBuyBox'
import { ProductCard } from '@/components/product/ProductCard'
import { RichText } from '@/components/product/RichText'
import { Sticker } from '@/components/product/Sticker'
import { showComparison } from '@/lib/commerce/product'
import { getProduct, listRelated } from '@/lib/data/catalog'
import { getStoreSettings } from '@/lib/data/globals'
import { formatINR } from '@/lib/format'
import { resolveImage } from '@/lib/media'

type Params = Promise<{ slug: string }>

const badgeLabel = { bestseller: 'Bestseller!', new: 'New!', limited: 'Limited' } as const
const marketplaceLabel = { amazon: 'Amazon', flipkart: 'Flipkart', meesho: 'Meesho' } as const

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await getProduct((await params).slug)
  if (!product) return { title: 'Not found' }
  const title = product.seo?.title?.trim() || product.title
  const description = product.seo?.description?.trim() || product.shortDescription || undefined
  const image = resolveImage(product.seo?.image ?? product.images?.[0], 'hero', product.title)
  return {
    title: `${title} | Reyan Collections`,
    description,
    openGraph: { title, description, images: image ? [{ url: image.src, alt: image.alt }] : undefined },
  }
}

export default async function ProductPage({ params }: { params: Params }) {
  const product = await getProduct((await params).slug)
  if (!product) notFound()
  const [settings, related] = await Promise.all([getStoreSettings(), listRelated(product)])

  const toGallery = (media: Parameters<typeof resolveImage>[0]) => {
    const hero = resolveImage(media, 'hero', product.title)
    const thumb = resolveImage(media, 'thumb', product.title)
    return hero ? [{ src: hero.src, thumb: thumb?.src ?? hero.src, alt: hero.alt }] : []
  }
  const productImages = (product.images ?? []).flatMap(toGallery)
  const variants: BuyBoxVariant[] = product.variants.flatMap((v) =>
    v.id
      ? [
          {
            id: v.id,
            name: v.name,
            swatch: v.swatch,
            stock: v.stock,
            images: (v.images ?? []).flatMap(toGallery),
          },
        ]
      : [],
  )

  const compare = showComparison(product) ? product.compareAt : null
  const badge = product.badge && product.badge !== 'none' ? badgeLabel[product.badge] : null
  const box = resolveImage(product.boxImage, 'card', `What's in the box for ${product.title}`)
  const highlights = (product.highlights ?? []).filter((h) => h.text)
  const links = product.marketplaceLinks ?? []
  const hasDescription = (product.description?.root?.children?.length ?? 0) > 0

  const header = (
    <div>
      {badge && <Sticker className="mb-3">{badge}</Sticker>}
      <h1 className="text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em] md:text-[44px]">{product.title}</h1>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b className="text-[32px] font-extrabold">{formatINR(product.price)}</b>
        {compare?.price && (
          <span className="text-sm text-softer">
            <s>{formatINR(compare.price)}</s> on{' '}
            {compare.url ? (
              <a href={compare.url} target="_blank" rel="noopener noreferrer nofollow" className="font-bold underline">
                {compare.marketplace ? marketplaceLabel[compare.marketplace] : 'Amazon'}
              </a>
            ) : (
              <span>{compare.marketplace ? marketplaceLabel[compare.marketplace] : 'Amazon'}</span>
            )}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-softer">Prices include GST</p>
      {product.shortDescription && <p className="mt-3 text-base leading-relaxed">{product.shortDescription}</p>}
    </div>
  )

  return (
    <article className="px-[18px] pt-6 pb-4 md:px-12 md:pt-10">
      <ProductBuyBox
        productId={product.id}
        title={product.title}
        variants={variants}
        productImages={productImages}
        maxPerOrder={settings.commerce?.maxPerOrder ?? 5}
        weightGrams={product.shipping.weightGrams}
        codAllowed={product.codAllowed !== false}
        whatsappNumber={settings.business?.whatsappNumber?.trim()}
        header={header}
      />

      <div className="mt-10 grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col gap-6">
          {highlights.length > 0 && (
            <section aria-labelledby="highlights-h">
              <h2 id="highlights-h" className="mb-2 text-2xl font-extrabold tracking-[-0.02em]">
                Highlights
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-base">
                {highlights.map((h) => (
                  <li key={h.id ?? h.text}>{h.text}</li>
                ))}
              </ul>
            </section>
          )}
          {hasDescription && (
            <section aria-labelledby="description-h">
              <h2 id="description-h" className="mb-2 text-2xl font-extrabold tracking-[-0.02em]">
                About this product
              </h2>
              <RichText data={product.description} />
            </section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {(product.ageGroup || product.bisNumber) && (
            <ul className="space-y-1 text-base font-bold">
              {product.ageGroup && <li>Age group: {product.ageGroup}</li>}
              {product.bisNumber && <li>BIS: {product.bisNumber}</li>}
            </ul>
          )}
          {box && (
            <section aria-labelledby="box-h">
              <h2 id="box-h" className="mb-2 text-2xl font-extrabold tracking-[-0.02em]">
                What&apos;s in the box
              </h2>
              <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] border-[3px] border-ink bg-white">
                <Image src={box.src} alt={box.alt} fill sizes="(min-width: 768px) 40vw, 100vw" className="object-contain" />
              </div>
            </section>
          )}
          {links.length > 0 && (
            <section aria-labelledby="also-h">
              <h2 id="also-h" className="mb-2 text-2xl font-extrabold tracking-[-0.02em]">
                Also available on
              </h2>
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <a
                    key={l.id ?? l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="rounded-full border-[2.5px] border-ink bg-white px-4 py-2 text-[15px] font-bold"
                  >
                    {marketplaceLabel[l.marketplace]}
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-h" className="mt-12">
          <h2 id="related-h" className="mb-4 text-[30px] font-extrabold tracking-[-0.04em] md:text-[40px]">
            You may also like
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-[22px]">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
