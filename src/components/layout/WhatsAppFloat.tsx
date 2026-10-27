import React from 'react'

import { getStoreSettings } from '@/lib/data/globals'
import { buildWhatsAppLink } from '@/lib/whatsapp'

export async function WhatsAppFloat() {
  const settings = await getStoreSettings()
  const number = settings.business?.whatsappNumber?.trim()
  if (!number) return null

  return (
    <a
      href={buildWhatsAppLink(number, 'Hi Reyan Collections, I have a question')}
      aria-label="Chat on WhatsApp"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed right-[18px] bottom-[22px] z-40 grid size-[54px] place-items-center rounded-full border-[3px] border-ink bg-[#25D366] shadow-pop-sm md:right-8 md:bottom-8 md:size-[66px] md:shadow-[4px_4px_0_var(--color-ink)]"
    >
      <svg width="30" height="30" viewBox="0 0 34 34" aria-hidden="true">
        <path
          d="M17 4C9.8 4 4 9.6 4 16.5c0 2.5.8 4.8 2.1 6.8L4.5 30l7-1.8c1.7.8 3.5 1.2 5.5 1.2 7.2 0 13-5.6 13-12.5S24.2 4 17 4z"
          fill="#fff"
          stroke="#1E1B4B"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M12.5 12.5c.5 3.5 4 7.5 8.5 8.6l1.6-1.9-2.6-1.4-1 1.1c-1.6-.7-3.1-2.2-3.8-3.8l1.1-1-1.3-2.6z"
          fill="#1E1B4B"
        />
      </svg>
    </a>
  )
}
