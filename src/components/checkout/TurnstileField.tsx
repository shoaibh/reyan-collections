'use client'

import React, { useEffect, useImperativeHandle, useRef } from 'react'

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  reset: (widgetId: string) => void
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

export type TurnstileHandle = { reset: () => void }

/**
 * The Cloudflare widget, live mode only. Mock mode never mounts this. A token is single-use, so the
 * parent calls `ref.current.reset()` after any failed submit to get a fresh one.
 */
export function TurnstileField({
  siteKey,
  onToken,
  onError,
  ref,
}: {
  siteKey: string
  onToken: (token: string) => void
  onError: () => void
  ref: React.Ref<TurnstileHandle>
}) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | undefined>(undefined)
  const callbacks = useRef({ onToken, onError })
  useEffect(() => {
    callbacks.current = { onToken, onError }
  })

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widget.current !== undefined) window.turnstile?.reset(widget.current)
    },
  }))

  useEffect(() => {
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (token) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(''),
          'error-callback': () => callbacks.current.onError(),
        })
      })
      .catch(() => callbacks.current.onError())
    return () => {
      cancelled = true
      if (widget.current !== undefined) window.turnstile?.remove(widget.current)
      widget.current = undefined
    }
  }, [siteKey])

  return <div ref={box} />
}
