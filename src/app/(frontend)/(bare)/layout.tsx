import React from 'react'

// The build runs without a database, so nothing under here is prerendered
export const dynamic = 'force-dynamic'

export default function BareLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>
}
