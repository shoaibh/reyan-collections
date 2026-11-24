import React from 'react'

import { getHomepage } from '@/lib/data/globals'

export async function AnnouncementBar() {
  const homepage = await getHomepage()
  const messages = (homepage.announcement ?? []).map((a) => a.text).filter(Boolean)
  if (messages.length === 0) return null

  return (
    <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 bg-ink px-2 py-2 text-[11.5px] font-medium text-butter md:gap-x-[18px] md:py-2.5 md:text-sm">
      {messages.map((text, i) => (
        <React.Fragment key={`${i}-${text}`}>
          {i > 0 && (
            <span aria-hidden="true" className="text-sun">
              ✦
            </span>
          )}
          <span>{text}</span>
        </React.Fragment>
      ))}
    </div>
  )
}
