import type { Metadata } from 'next'
import React from 'react'

import { bricolage } from '@/lib/fonts'
import { BRAND } from '@/lib/seo'

import NotFound from './(frontend)/(site)/not-found'
import './(frontend)/globals.css'

export const metadata: Metadata = { title: `Page not found · ${BRAND}` }

// A URL that matches no route skips every layout, so this renders its own document around the
// branded 404 used by the storefront
export default function GlobalNotFound() {
  return (
    <html lang="en" className={bricolage.variable}>
      <body>
        <main>
          <NotFound />
        </main>
      </body>
    </html>
  )
}
