import type { Metadata } from 'next'
import React from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import { getStoreSettings } from '@/lib/data/globals'
import { bricolage } from '@/lib/fonts'
import { BRAND, DEFAULT_OG_IMAGE, siteUrl } from '@/lib/seo'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: `Daily finds • Home • Toys. Shop ${BRAND} online for fun finds for kids and the home.`,
  openGraph: { siteName: BRAND, images: [DEFAULT_OG_IMAGE] },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const settings = await getStoreSettings()

  return (
    <html lang="en" className={bricolage.variable}>
      <body>
        <CartProvider maxPerOrder={settings.commerce?.maxPerOrder ?? 5}>{children}</CartProvider>
      </body>
    </html>
  )
}
