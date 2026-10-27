import Link from 'next/link'
import React from 'react'

type IconType = 'shop' | 'whatsapp' | 'amazon' | 'flipkart' | 'meesho' | 'instagram' | 'link'

const iconBg: Record<IconType, string> = {
  shop: 'bg-sun',
  whatsapp: 'bg-mint',
  amazon: 'bg-sun',
  flipkart: 'bg-pink',
  meesho: 'bg-pink',
  instagram: 'bg-pink',
  link: 'bg-butter',
}

const stroke = { fill: 'none', stroke: '#1E1B4B', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// Simple generic glyphs, deliberately not brand logos
function Icon({ type }: { type: IconType }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
      {type === 'shop' && (
        <>
          <path d="M5 8h14l-1 11H6z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
        </>
      )}
      {type === 'whatsapp' && <path d="M4 5h16v11H9l-5 4z" />}
      {type === 'amazon' && (
        <>
          <path d="M3 5h3l2 10h10l2-7H7" />
          <circle cx="10" cy="19" r="1" />
          <circle cx="17" cy="19" r="1" />
        </>
      )}
      {type === 'flipkart' && (
        <>
          <path d="M4 10h16v10H4z" />
          <path d="M12 10v10M4 10l2-5h12l2 5" />
        </>
      )}
      {type === 'meesho' && (
        <>
          <path d="M4 9l2-4h12l2 4" />
          <path d="M5 9v10h14V9" />
          <path d="M10 19v-5h4v5" />
        </>
      )}
      {type === 'instagram' && (
        <>
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <circle cx="12" cy="12" r="3.5" />
        </>
      )}
      {type === 'link' && (
        <>
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </>
      )}
    </svg>
  )
}

export function LinkButton({
  label,
  url,
  iconType,
  highlight,
}: {
  label: string
  url: string
  iconType?: IconType | null
  highlight?: boolean | null
}) {
  const type = iconType ?? 'link'
  const className = `relative mb-3.5 flex items-center gap-3 rounded-[18px] border-[3px] border-ink px-4 py-3.5 text-left text-[19px] font-extrabold shadow-[4px_4px_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 ${
    highlight ? 'bg-cobalt text-white' : 'bg-white text-ink'
  }`
  const inner = (
    <>
      <span className={`grid size-[38px] flex-none place-items-center rounded-xl border-[2.5px] border-ink ${iconBg[type]}`}>
        <Icon type={type} />
      </span>
      <span>{label}</span>
      <span className="ml-auto text-lg" aria-hidden="true">
        →
      </span>
    </>
  )
  return url.startsWith('/') && !url.startsWith('//') ? (
    <Link href={url} data-testid="link-button" className={className}>
      {inner}
    </Link>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" data-testid="link-button" className={className}>
      {inner}
    </a>
  )
}
