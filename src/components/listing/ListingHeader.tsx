import React from 'react'

export function ListingHeader({
  title,
  description,
  count,
}: {
  title: string
  description?: string | null
  count?: number
}) {
  return (
    <div className="mb-4 md:mb-6">
      <h1 className="text-[34px] leading-[1.05] font-extrabold tracking-[-0.04em] md:text-[56px]">{title}</h1>
      {description && <p className="mt-2 max-w-[640px] text-[15px] text-soft md:text-lg">{description}</p>}
      {count !== undefined && (
        <p className="mt-2 text-[13px] font-bold text-softer md:text-[15px]">
          {count} {count === 1 ? 'product' : 'products'}
        </p>
      )}
    </div>
  )
}
