import { Bricolage_Grotesque } from 'next/font/google'
import React from 'react'
import { CartProvider } from '@/components/cart/CartProvider'
import { getStoreSettings } from '@/lib/data/globals'
import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
})

export const metadata = {
  description: 'Daily finds • Home • Toys',
  title: 'Reyan Collections',
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
