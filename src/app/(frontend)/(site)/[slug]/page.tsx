import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { RichText } from '@/components/product/RichText'
import { getPage, RESERVED_SLUGS } from '@/lib/data/pages'
import { resolveImage } from '@/lib/media'

type Params = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await getPage((await params).slug)
  if (!page) return { title: 'Not found' }
  const title = page.seo?.title?.trim() || page.title
  const description = page.seo?.description?.trim() || undefined
  const image = resolveImage(page.seo?.image, 'hero', page.title)
  return {
    title,
    description,
    openGraph: { title, description, images: image ? [{ url: image.src, alt: image.alt }] : undefined },
  }
}

export default async function CmsPage({ params }: { params: Params }) {
  const { slug } = await params
  // Static app routes win over this segment, but a reserved slug must never render as a page
  if (RESERVED_SLUGS.has(slug)) notFound()
  const page = await getPage(slug)
  if (!page) notFound()

  return (
    <article className="px-[18px] pt-6 pb-4 md:px-12 md:pt-10">
      <h1 className="mb-6 text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em] md:text-[44px]">{page.title}</h1>
      <RichText data={page.content} />
    </article>
  )
}
