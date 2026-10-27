'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import React from 'react'

export function SortSelect({ value }: { value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  return (
    <label className="flex items-center gap-2 text-[13px] font-bold md:text-[15px]">
      Sort by
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString())
          if (e.target.value === 'featured') next.delete('sort')
          else next.set('sort', e.target.value)
          const qs = next.toString()
          router.push(qs ? `${pathname}?${qs}` : pathname)
        }}
        className="rounded-full border-[2.5px] border-ink bg-white px-3 py-1.5 text-[13px] font-bold text-ink md:text-[15px]"
      >
        <option value="featured">Featured</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
      </select>
    </label>
  )
}
