'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { formatINR } from '@/lib/format'
// Type-only: orderPanel.ts pulls in server code that must never reach the browser bundle
import type { OrderPanel } from '@/lib/commerce/orderPanel'

import styles from './panel.module.css'

const PILL: Partial<Record<OrderPanel['status'], string>> = {
  pending_payment: styles.pillAmber,
  awaiting_confirmation: styles.pillAmber,
  confirmed: styles.pillBlue,
  ready_to_ship: styles.pillBlue,
  shipped: styles.pillGreen,
  out_for_delivery: styles.pillGreen,
  delivered: styles.pillGreen,
  cancelled: styles.pillRed,
  rto: styles.pillRed,
}

const SIMULATE = [
  { label: 'Picked up', status: 'PICKED UP' },
  { label: 'Out for delivery', status: 'OUT FOR DELIVERY' },
  { label: 'Delivered', status: 'DELIVERED' },
  { label: 'RTO', status: 'RTO INITIATED' },
] as const

const SHIPPED_OR_LATER: OrderPanel['status'][] = ['ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'rto', 'returned']

const OrderActionsPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const router = useRouter()
  const [panel, setPanel] = useState<OrderPanel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [restock, setRestock] = useState(false)
  const [refundNote, setRefundNote] = useState('')
  const inFlight = useRef(false)

  const call = useCallback(
    async (path: string, init?: { method: 'GET' | 'POST'; body?: unknown }) => {
      if (inFlight.current) return
      inFlight.current = true
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/orders/${id}${path}`, {
          method: init?.method ?? 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: init?.method === 'GET' ? undefined : JSON.stringify(init?.body ?? {}),
        })
        const data = (await res.json().catch(() => ({}))) as { panel?: OrderPanel; error?: string }
        if (!res.ok || !data.panel) {
          setError(data.error ?? 'Something went wrong. Try again.')
          return
        }
        setPanel(data.panel)
        router.refresh()
      } catch {
        setError('Could not reach the server. Check your connection and try again.')
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [id, router],
  )

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetch(`/api/orders/${id}/panel`, { credentials: 'include' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { panel?: OrderPanel; error?: string }
        if (cancelled) return
        if (res.ok && data.panel) setPanel(data.panel)
        else setError(data.error ?? 'Could not load the order actions.')
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the order actions.')
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (!id) return null
  if (!panel) {
    return (
      <div className={styles.panel}>
        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : (
          <div className={styles.loading}>Loading order actions…</div>
        )}
      </div>
    )
  }

  const has = (a: OrderPanel['actions'][number]) => panel.actions.includes(a)
  // The panel carries no payment status. A prepaid order past pending_payment has been paid online.
  const prepaidPaid = panel.paymentMethod === 'prepaid' && panel.status !== 'pending_payment'
  const cod = panel.paymentMethod === 'cod'
  const t = panel.totals

  const onCancel = () => {
    const message = `Cancel ${panel.orderNumber}?${prepaidPaid ? ` The customer will be refunded ${formatINR(t.total)}` : ''}`
    if (window.confirm(message)) void call('/cancel')
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(panel.customerUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy the link. Copy it from your browser instead.')
    }
  }

  const showNextStep =
    has('confirm') || has('ship') || has('mark-delivered') || has('mark-returned') || has('restock') ||
    panel.whatsapp !== null || (panel.shipment !== null && SHIPPED_OR_LATER.includes(panel.status))

  return (
    <div className={styles.panel}>
      <div className={styles.top}>
        <h3>Order {panel.orderNumber}</h3>
        <span className={`${styles.pill} ${PILL[panel.status] ?? styles.pillBlue}`}>{panel.statusLabel}</span>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {panel.alerts.map((a) => (
        <div className={styles.alert} key={a.kind}>
          <span>{a.message}</span>
          <button type="button" disabled={busy} onClick={() => void call('/handle-alert', { method: 'POST', body: { kind: a.kind } })}>
            Mark handled
          </button>
        </div>
      ))}

      <div className={styles.card}>
        <ol className={styles.steps}>
          {panel.steps.map((s) => (
            <li key={s.label} className={s.state === 'todo' ? undefined : styles[s.state]}>
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h4>Customer</h4>
        </div>
        <div className={styles.kv}>
          <span>Name</span>
          <span>{panel.customer.name}</span>
        </div>
        <div className={styles.kv}>
          <span>Phone</span>
          <span>
            <a href={`tel:${panel.customer.phone}`}>{panel.customer.phone}</a>
          </span>
        </div>
        <div className={styles.kv}>
          <span>Address</span>
          <span>{panel.customer.address}</span>
        </div>
        <div className={`${styles.note} ${panel.eligibility.ok ? styles.noteOk : styles.noteWarn}`}>{panel.eligibility.note}</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <h4>Items</h4>
        </div>
        {panel.items.map((i, n) => (
          <div className={styles.kv} key={`${i.label}-${n}`}>
            <span>
              {i.label} × {i.qty}
            </span>
            <span>{formatINR(i.lineTotal)}</span>
          </div>
        ))}
        <div className={styles.kv}>
          <span>Shipping</span>
          <span>{formatINR(t.shippingFee)}</span>
        </div>
        {t.codeDiscount > 0 ? (
          <div className={styles.kv}>
            <span>Discount{t.discountCode ? ` (${t.discountCode})` : ''}</span>
            <span>−{formatINR(t.codeDiscount)}</span>
          </div>
        ) : null}
        {t.prepaidDiscount > 0 ? (
          <div className={styles.kv}>
            <span>Prepaid discount</span>
            <span>−{formatINR(t.prepaidDiscount)}</span>
          </div>
        ) : null}
        <div className={`${styles.kv} ${styles.total}`}>
          <span>{panel.paymentLabel}</span>
          <span>{formatINR(t.total)}</span>
        </div>
      </div>

      <div className={`${styles.card} ${styles.amber}`}>
        <div className={styles.cardHead}>
          <h4>Next step</h4>
        </div>

        {panel.whatsapp ? (
          <>
            <a className={`${styles.big} ${styles.wa}`} href={panel.whatsapp.url} target="_blank" rel="noopener noreferrer">
              Confirm on WhatsApp
            </a>
            <div className={styles.msg}>
              <small>Message that opens, ready to send</small>
              {panel.whatsapp.message}
            </div>
          </>
        ) : null}

        {has('confirm') ? (
          <button type="button" className={`${styles.big} ${styles.dark}`} disabled={busy} onClick={() => void call('/confirm')}>
            Customer replied YES · Mark confirmed
          </button>
        ) : null}
        {has('confirm') && panel.autoCancelLabel ? <p className={styles.hint}>{panel.autoCancelLabel}</p> : null}

        {has('ship') ? (
          <button type="button" className={`${styles.big} ${styles.dark}`} disabled={busy} onClick={() => void call('/ship')}>
            Ship with Shiprocket
          </button>
        ) : null}

        {panel.shipment && SHIPPED_OR_LATER.includes(panel.status) ? (
          <>
            <div className={styles.kv}>
              <span>AWB</span>
              <span>{panel.shipment.awb}</span>
            </div>
            <div className={styles.kv}>
              <span>Courier</span>
              <span>{panel.shipment.courierName}</span>
            </div>
            <div className={styles.links}>
              {panel.shipment.trackingUrl ? (
                <a href={panel.shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                  Track parcel
                </a>
              ) : null}
              {panel.shipment.labelUrl ? (
                <a href={panel.shipment.labelUrl} target="_blank" rel="noopener noreferrer">
                  Shipping label
                </a>
              ) : null}
            </div>
          </>
        ) : null}

        {has('mark-delivered') ? (
          <button type="button" className={`${styles.big} ${styles.dark}`} disabled={busy} onClick={() => void call('/mark-delivered')}>
            Mark delivered
          </button>
        ) : null}

        {has('mark-returned') ? (
          // A div, not a <form>: this panel renders inside Payload's own edit form, and forms cannot nest
          <div
            className={styles.form}
            onKeyDown={(e) => {
              // Enter in the note must not submit Payload's surrounding form
              if (e.key === 'Enter') e.preventDefault()
            }}
          >
            <label>
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
              Restock items
            </label>
            {cod ? (
              <label className={styles.field}>
                Cash refund note
                <input type="text" required value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
              </label>
            ) : null}
            <button
              type="button"
              className={`${styles.big} ${styles.dark}`}
              disabled={busy}
              onClick={() => {
                if (cod && refundNote.trim() === '') {
                  setError('Add a cash refund note first.')
                  return
                }
                void call('/mark-returned', { method: 'POST', body: { restock, refundNote } })
              }}
            >
              Mark returned
            </button>
          </div>
        ) : null}

        {has('restock') ? (
          <button type="button" className={`${styles.big} ${styles.dark}`} disabled={busy} onClick={() => void call('/restock')}>
            Restock items
          </button>
        ) : null}

        {panel.status === 'rto' && panel.codBlocklisted ? (
          <p className={styles.hint}>
            <Link href="/admin/collections/cod-blocklist">Phone added to COD blocklist</Link>
          </p>
        ) : null}

        {showNextStep ? null : <p className={styles.hint}>Nothing to do right now.</p>}

        <div className={styles.two}>
          <a className={styles.small} href={panel.packingSlipUrl} target="_blank" rel="noopener noreferrer">
            Packing slip
          </a>
          {panel.invoice ? (
            <a className={styles.small} href={panel.invoice.url} target="_blank" rel="noopener noreferrer">
              GST invoice
            </a>
          ) : (
            <span className={styles.small} aria-disabled="true">
              GST invoice
            </span>
          )}
        </div>
        <button type="button" className={`${styles.small} ${styles.full}`} onClick={() => void onCopy()}>
          {copied ? 'Copied' : 'Copy customer link'}
        </button>

        {has('cancel') ? (
          <button type="button" className={styles.cancel} disabled={busy} onClick={onCancel}>
            Cancel order
          </button>
        ) : null}
      </div>

      {panel.dev.simulate ? (
        <div className={styles.sim}>
          Simulate courier
          <div>
            {SIMULATE.map((s) => (
              <button
                key={s.status}
                type="button"
                disabled={busy}
                onClick={() => void call('/simulate', { method: 'POST', body: { status: s.status } })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default OrderActionsPanel
