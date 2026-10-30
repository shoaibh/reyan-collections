import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { integrationMode } from '@/lib/integrations/mode'

export const metadata: Metadata = { title: 'Shipping label', robots: { index: false, follow: false } }

/** Stands in for the courier's label PDF while SHIPROCKET_MODE is mock. Never reachable in production. */
export default async function MockLabelPage({ searchParams }: { searchParams: Promise<{ awb?: string | string[] }> }) {
  const { awb: param } = await searchParams // reading it first keeps the page dynamic, never prerendered
  if (process.env.NODE_ENV === 'production' || integrationMode('SHIPROCKET') !== 'mock') notFound()
  const awb = typeof param === 'string' ? param : ''
  if (!awb) notFound()

  return (
    <div className="mx-auto min-h-screen max-w-[480px] px-[22px] pt-[34px] pb-10">
      <div className="rounded-2xl border-[3px] border-ink bg-white p-6 shadow-[5px_5px_0_var(--color-ink)]">
        <h1 className="text-[27px] font-extrabold tracking-[-0.035em]">Shipping label</h1>
        <p className="mt-4 text-[17px] font-extrabold">AWB {awb}</p>
        <p className="text-[17px] font-extrabold">Mock Express</p>
        <p className="mt-2 text-[15px]">This is a test label. Nothing is shipped.</p>
      </div>
    </div>
  )
}
