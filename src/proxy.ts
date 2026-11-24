import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { originAllowed } from '@/lib/request'

// Runs on the Node.js runtime in Next 16, so node:crypto is available to originAllowed
export function proxy(request: NextRequest) {
  if (!originAllowed(request.nextUrl.pathname, request.headers, process.env)) {
    return new NextResponse(null, { status: 403 })
  }
  return NextResponse.next()
}
