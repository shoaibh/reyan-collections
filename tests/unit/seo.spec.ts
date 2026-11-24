import { describe, it, expect } from 'vitest'

import { productJsonLd, serializeJsonLd } from '@/lib/seo'
import type { Product } from '@/payload-types'

const url = 'https://reyancollection.in/p/mexico-premium-container-set-of-2'

const container = {
  id: 1,
  title: 'Mexico Premium Container Set of 2',
  slug: 'mexico-premium-container-set-of-2',
  price: 449,
  shortDescription: 'A two-piece container set',
  images: [{ id: 10, url: '/media/container.jpg', alt: 'Container set' }],
  variants: [
    { name: 'Mint', stock: 6 },
    { name: 'Sand', stock: 3 },
  ],
} as unknown as Product

describe('productJsonLd', () => {
  it('prices the container in INR and marks it in stock', () => {
    expect(productJsonLd(container, url)).toMatchObject({
      '@type': 'Product',
      name: 'Mexico Premium Container Set of 2',
      brand: { '@type': 'Brand', name: 'Reyan Collections' },
      offers: {
        price: 449,
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
        url,
      },
    })
  })

  it('marks the container out of stock when every variant is at 0', () => {
    const soldOut = {
      ...container,
      variants: [
        { name: 'Mint', stock: 0 },
        { name: 'Sand', stock: 0 },
      ],
    } as unknown as Product
    expect(productJsonLd(soldOut, url)).toMatchObject({
      offers: { availability: 'https://schema.org/OutOfStock' },
    })
  })

  it('makes image URLs absolute against the product URL origin', () => {
    expect(productJsonLd(container, url)).toMatchObject({
      image: ['https://reyancollection.in/media/container.jpg'],
    })
  })
})

describe('serializeJsonLd', () => {
  it('escapes < so a title cannot close the script tag', () => {
    const html = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(html).not.toContain('<')
    expect(JSON.parse(html)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})
