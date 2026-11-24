import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

import { storefrontSecurityHeaders } from './src/lib/securityHeaders'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

// Media is served straight from the R2 public domain in production, so next/image must allow its host
const r2Host = process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).hostname : undefined

const nextConfig: NextConfig = {
  // The Payload admin and the storefront are separate root layouts, so a URL that matches no route at
  // all needs a global 404 (a root app/not-found.tsx has no single layout to render inside)
  experimental: { globalNotFound: true },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
    remotePatterns: r2Host ? [{ protocol: 'https', hostname: r2Host }] : [],
  },
  async headers() {
    return [
      {
        // Storefront only: not the Payload admin, the API or Next's own assets
        source: '/((?!admin|api|_next).*)',
        headers: storefrontSecurityHeaders({
          production: process.env.NODE_ENV === 'production',
          mediaOrigin: process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).origin : undefined,
        }),
      },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
