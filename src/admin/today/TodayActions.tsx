'use client'

import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'

import styles from './today.module.css'

type Props = {
  orderId: number
  action: 'confirm' | 'ship'
  /** Only the Confirm COD rows have one: the WhatsApp message to the customer. */
  whatsappUrl?: string
}

/** The row buttons on the Today view: a ✓ (confirm) or Ship button that POSTs, then refreshes the view. */
const TodayActions: React.FC<Props> = ({ orderId, action, whatsappUrl }) => {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const run = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Something went wrong. Try again.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.acts}>
        {whatsappUrl ? (
          <a className={styles.waBtn} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        ) : null}
        {action === 'confirm' ? (
          <button type="button" className={styles.okBtn} disabled={busy} onClick={() => void run()} aria-label="Confirm order">
            ✓
          </button>
        ) : (
          <button type="button" className={styles.priBtn} disabled={busy} onClick={() => void run()}>
            Ship
          </button>
        )}
      </div>
      {error ? (
        <div className={styles.rowError} role="alert">
          {error}
        </div>
      ) : null}
    </>
  )
}

export default TodayActions
