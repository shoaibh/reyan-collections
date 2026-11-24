import React from 'react'

const stroke = { stroke: '#1E1B4B', strokeWidth: 2.5 }

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="size-7 flex-none md:size-10">
      {children}
    </svg>
  )
}

export function TrustRow({ returnWindowDays }: { returnWindowDays: number }) {
  const items = [
    {
      title: 'GST-registered business',
      note: 'Proper invoice with every order',
      icon: (
        <Icon>
          <rect x="7" y="4" width="26" height="32" rx="4" fill="#FFD23F" {...stroke} />
          <path d="M13 13h14M13 19h14M13 25h8" fill="none" strokeLinecap="round" {...stroke} />
        </Icon>
      ),
    },
    {
      title: 'Cash on delivery',
      note: 'Pay when it arrives',
      icon: (
        <Icon>
          <rect x="3" y="10" width="34" height="21" rx="4" fill="#3CCB9A" {...stroke} />
          <circle cx="20" cy="20.5" r="5" fill="#fff" {...stroke} />
        </Icon>
      ),
    },
    {
      title: `Easy ${returnWindowDays}-day returns`,
      note: 'No-fuss replacements',
      icon: (
        <Icon>
          <path d="M10 15a12 12 0 1 1-1 11" fill="none" strokeLinecap="round" {...stroke} />
          <path d="M5 9l5 6 6-4" fill="none" stroke="#FF5A36" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
      ),
    },
    {
      title: 'Secure payments',
      note: 'UPI, cards, netbanking',
      icon: (
        <Icon>
          <path d="M20 4l13 5v9c0 9-6 15-13 18C13 33 7 27 7 18V9z" fill="#2D5BFF" strokeLinejoin="round" {...stroke} />
          <path d="M14 20l4 4 8-8" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
      ),
    },
  ]

  return (
    <ul className="mx-[18px] grid grid-cols-2 overflow-hidden rounded-[18px] border-[3px] border-ink bg-white shadow-[4px_4px_0_var(--color-ink)] md:mx-12 md:grid-cols-4 md:rounded-[22px] md:shadow-[6px_6px_0_var(--color-ink)]">
      {items.map((item, i) => (
        <li
          key={item.title}
          className={`flex items-center gap-2 p-3 text-[13px] leading-tight font-bold md:gap-3 md:px-[22px] md:py-5 md:text-base ${
            i % 2 === 1 ? 'border-l-2 border-dashed border-[#c9c6e0]' : ''
          } ${i >= 2 ? 'border-t-2 border-dashed border-[#c9c6e0] md:border-t-0' : ''} ${i > 0 ? 'md:border-l-2 md:border-dashed md:border-[#c9c6e0]' : ''}`}
        >
          {item.icon}
          <div>
            <span>{item.title}</span>
            <small className="mt-0.5 block text-[11px] font-normal text-soft md:text-[13px]">{item.note}</small>
          </div>
        </li>
      ))}
    </ul>
  )
}
