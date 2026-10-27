import { Bricolage_Grotesque } from 'next/font/google'
import type { Metadata } from 'next'
import React from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import { getStoreSettings } from '@/lib/data/globals'
import { BRAND, siteUrl } from '@/lib/seo'
import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description: `Daily finds • Home • Toys. Shop ${BRAND} online for fun finds for kids and the home.`,
  openGraph: { siteName: BRAND, images: ['/brand/logo-circle.jpg'] },
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
