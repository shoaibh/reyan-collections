import React from 'react'

const waveMobile =
  'M0 0h390v8c-16 0-16 14-32 14S342 8 325 8s-16 14-32 14-16-14-33-14-16 14-32 14-16-14-33-14-16 14-32 14-16-14-32-14-17 14-33 14-16-14-32-14-16 14-33 14S16 8 0 8z'

export type Marketplace = { label: string; href: string }

export function WhyDirect({ marketplaces }: { marketplaces: Marketplace[] }) {
  const card = 'rounded-[18px] border-[2.5px] border-butter/90 p-[18px] md:rounded-[22px] md:p-[26px]'
  const chip =
    'mb-2.5 inline-block rounded-full bg-sun px-2.5 py-[3px] text-xs font-bold text-ink md:mb-3.5 md:px-3 md:py-1 md:text-sm'
  const h4 = 'mb-1.5 text-xl font-extrabold tracking-[-0.02em] md:text-[25px]'
  const p = 'text-sm leading-normal text-butter/90 md:text-[15.5px]'

  return (
    <section
      aria-labelledby="why-h"
      className="relative mt-14 -mb-10 bg-ink px-[18px] pt-14 pb-9 text-butter md:mt-[90px] md:px-12 md:pt-[90px] md:pb-[60px]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 390 24"
        preserveAspectRatio="none"
        className="absolute inset-x-0 -top-px block h-6 w-full md:h-10"
      >
        <path d={waveMobile} fill="#FFF6DA" />
      </svg>
      <h2
        id="why-h"
        className="mb-[22px] max-w-[720px] text-[34px] leading-none font-extrabold tracking-[-0.04em] md:mb-9 md:text-[54px]"
      >
        Why buy <span className="text-sun">directly</span> from us?
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-[22px]">
        <div className={card}>
          <b className={chip}>Lower price</b>
          <h3 className={h4}>No marketplace cut</h3>
          <p className={p}>
            We skip the platform fees and pass the savings on to you. Same product, smaller price.
          </p>
        </div>
        <div className={card}>
          <b className={chip}>Real people</b>
          <h3 className={h4}>Talk to us on WhatsApp</h3>
          <p className={p}>
            Questions before you buy, help after it arrives. A family business, not a call centre.
          </p>
        </div>
        <div className={card}>
          <b className={chip}>Trusted</b>
          <h3 className={h4}>Already loved on marketplaces</h3>
          {marketplaces.length > 0 ? (
            <>
              <p className={p}>The same products people already order from our stores on</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {marketplaces.map((m) => (
                  <a
                    key={m.label}
                    href={m.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border-2 border-butter px-2 py-0.5 text-[11.5px] md:px-2.5 md:py-[3px] md:text-[13px]"
                  >
                    {m.label}
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className={p}>The same products people already know and order from the big marketplaces.</p>
          )}
        </div>
      </div>
    </section>
  )
}
