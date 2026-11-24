export function storefrontSecurityHeaders(opts: { production: boolean; mediaOrigin?: string }): { key: string; value: string }[] {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    'https://checkout.razorpay.com',
    'https://challenges.cloudflare.com',
    'https://static.cloudflareinsights.com',
  ]
  if (!opts.production) scriptSrc.push("'unsafe-eval'")

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    'frame-src https://api.razorpay.com https://checkout.razorpay.com https://challenges.cloudflare.com',
    "connect-src 'self' https://lumberjack.razorpay.com https://cloudflareinsights.com",
    `img-src ${["'self'", 'data:', 'blob:', opts.mediaOrigin, 'https://cdn.razorpay.com'].filter(Boolean).join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ')

  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ]
}
