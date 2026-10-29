'use client'

import React, { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void },
  ) => string
  remove: (widgetId: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      scriptPromise = null
      el.remove()
      reject(new Error('Could not load the verification check'))
    }
    document.head.appendChild(el)
  })
  return scriptPromise
}

/** The Cloudflare widget, live mode only. Mock mode never mounts this. */
export function TurnstileField({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const callback = useRef(onToken)
  useEffect(() => {
    callback.current = onToken
  })

  useEffect(() => {
    let widgetId: string | undefined
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        widgetId = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(''),
        })
      })
      .catch(() => callback.current(''))
    return () => {
      cancelled = true
      if (widgetId !== undefined) window.turnstile?.remove(widgetId)
    }
  }, [siteKey])

  return <div ref={box} />
}
