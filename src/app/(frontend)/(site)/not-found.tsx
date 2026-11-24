import React from 'react'

import { Button } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <section className="px-[18px] pt-16 pb-16 text-center md:px-12 md:pt-24">
      <p className="mb-3 text-sm font-extrabold tracking-[0.12em] text-softer uppercase">Error 404</p>
      <h1 className="mx-auto max-w-[14ch] text-[36px] leading-[1.02] font-extrabold tracking-[-0.04em] md:text-[56px]">
        This page went out of stock
      </h1>
      <p className="mx-auto mt-4 max-w-[36ch] text-base leading-relaxed">
        The link may be old, or the page may have moved. The shop still has plenty of fun finds.
      </p>
      <div className="mt-8 flex justify-center">
        <Button href="/shop" variant="blue">
          Back to shop
        </Button>
      </div>
    </section>
  )
}
