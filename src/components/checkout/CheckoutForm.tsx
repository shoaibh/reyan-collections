'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { useCart } from '@/components/cart/CartProvider'
import { launchPayment } from '@/components/checkout/launchPayment'
import { OrderSummary } from '@/components/checkout/OrderSummary'
import { errorClass, inputClass, labelClass, TextField } from '@/components/checkout/TextField'
import { TurnstileField, type TurnstileHandle } from '@/components/checkout/TurnstileField'
import { fieldErrors, type CheckoutField, type CheckoutFields } from '@/lib/commerce/checkoutInput'
import type { PaymentLaunch } from '@/lib/commerce/paymentLaunch'
import type { PaymentMethod } from '@/lib/commerce/pricing'
import type { Quote } from '@/lib/commerce/quote'
import { formatINR } from '@/lib/format'
import { INDIAN_STATES, PINCODE_RE, normalizePhone } from '@/lib/india'
import { MOCK_TURNSTILE_TOKEN } from '@/lib/integrations/turnstile'

type Props = {
  turnstile: { mode: 'mock' | 'live'; siteKey: string | null }
  prepaidDiscount: number
}

const EMPTY: CheckoutFields = {
  name: '',
  phone: '',
  email: '',
  line1: '',
  line2: '',
  landmark: '',
  pincode: '',
  city: '',
  state: '',
}

const card = 'rounded-[18px] border-[3px] border-ink bg-white p-4 shadow-pop-sm'
const cardTitle = 'mb-3 text-xl font-extrabold'
const smallButton =
  'rounded-xl border-[3px] border-ink bg-ink px-5 py-3 text-base font-bold text-butter disabled:opacity-60'

const FIELD_IDS: Record<CheckoutField, string> = {
  name: 'co-name',
  phone: 'co-phone',
  email: 'co-email',
  line1: 'co-line1',
  line2: 'co-line2',
  landmark: 'co-landmark',
  pincode: 'co-pincode',
  city: 'co-city',
  state: 'co-state',
}
const FIELD_ORDER: CheckoutField[] = ['name', 'phone', 'email', 'line1', 'line2', 'landmark', 'pincode', 'city', 'state']

/** randomUUID needs a secure context; a plain-http LAN preview falls back to getRandomValues. */
function newKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

type QuoteResult = { key: string; quote: Quote | null }
type OrderResponse = {
  orderNumber?: string
  orderUrl?: string
  payment?: PaymentLaunch | null
  error?: string
  code?: string
  field?: string
}

export function CheckoutForm({ turnstile, prepaidDiscount }: Props) {
  const cart = useCart()
  const router = useRouter()

  const [fields, setFields] = useState<CheckoutFields>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, string>>>({})
  const [method, setMethod] = useState<PaymentMethod>('prepaid')
  const [codeInput, setCodeInput] = useState('')
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [token, setToken] = useState(turnstile.mode === 'mock' ? MOCK_TURNSTILE_TOKEN : '')
  const [honeypot, setHoneypot] = useState('')
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const [securityError, setSecurityError] = useState(false)
  const submitGuard = useRef(false)
  const turnstileRef = useRef<TurnstileHandle>(null)

  const set = (key: CheckoutField) => (value: string) => {
    setFields((f) => ({ ...f, [key]: value }))
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  }

  const pincode = fields.pincode.trim()
  const pincodeOk = PINCODE_RE.test(pincode)
  const phone = normalizePhone(fields.phone)

  // Everything the server prices from. A change here means the shown quote is stale.
  const request = useMemo(
    () => ({
      items: cart.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })),
      pincode: pincodeOk ? pincode : undefined,
      paymentMethod: method,
      discountCode: appliedCode,
      phone: phone ?? undefined,
    }),
    [cart.lines, pincodeOk, pincode, method, appliedCode, phone],
  )
  const requestKey = JSON.stringify([request, refresh])

  useEffect(() => {
    if (request.items.length === 0) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      let quote: Quote | null = null
      try {
        const res = await fetch('/api/checkout/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
          cache: 'no-store',
        })
        if (res.ok) quote = (await res.json()) as Quote
      } catch {
        if (controller.signal.aborted) return
      }
      if (controller.signal.aborted) return
      setResult({ key: requestKey, quote })
      if (!quote) return
      // The quote clamps lines to live stock: write that back so the cart, the summary and the order agree
      for (const line of quote.lines) {
        const sent = request.items.find((i) => i.productId === line.productId && i.variantId === line.variantId)
        if (sent && sent.qty > line.qty) cart.setQty(line.productId, line.variantId, line.qty)
      }
      // Fill city and state from the pincode, never over what the shopper typed
      const d = quote.delivery
      if (d && d.pincode === request.pincode) {
        const state = INDIAN_STATES.find((s) => s.name === d.state)?.name
        setFields((f) => ({ ...f, city: f.city || d.city || '', state: f.state || state || '' }))
      }
      if (!quote.cod.eligible) setMethod((m) => (m === 'cod' ? 'prepaid' : m))
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // requestKey encodes request and refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const current = result?.key === requestKey ? result : null
  const quote = result?.quote ?? null
  const loading = request.items.length > 0 && current === null
  const failed = current !== null && current.quote === null
  const delivery = quote?.delivery && quote.delivery.pincode === pincode ? quote.delivery : null
  const unserviceable = !loading && delivery !== null && !delivery.serviceable
  const codOk = quote?.cod.eligible !== false
  const prepaidSaving = quote?.totals.prepaidSaving ?? prepaidDiscount

  const applyCode = () => {
    const code = codeInput.trim().toUpperCase()
    if (code) setAppliedCode(code)
  }
  const removeCode = () => {
    setAppliedCode(null)
    setCodeInput('')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitGuard.current || loading || !quote || quote.lines.length === 0 || unserviceable) return
    setFormError(null)

    const found = fieldErrors(fields)
    setErrors(found)
    const first = FIELD_ORDER.find((k) => found[k])
    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus()
      return
    }
    if (!token) {
      setFormError('Please complete the verification check, then place your order.')
      return
    }

    submitGuard.current = true
    setSubmitting(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...fields,
          // Exactly what the summary shows: clamped quantities, and no dropped lines
          items: quote.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, qty: l.qty })),
          paymentMethod: method,
          discountCode: quote.discountCode,
          turnstileToken: token,
          honeypot,
          idempotencyKey,
          expectedTotal: quote.totals.total,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as OrderResponse

      if (!res.ok || !data.orderUrl) {
        // A failed attempt must never be replayed under the same key, and a Turnstile token is single-use
        setIdempotencyKey(newKey())
        if (turnstile.mode === 'live') {
          setToken('')
          turnstileRef.current?.reset()
        }
        const field = FIELD_ORDER.find((k) => k === data.field)
        if (field && data.error) {
          setErrors({ [field]: data.error })
          document.getElementById(FIELD_IDS[field])?.focus()
        } else {
          setFormError(data.error ?? 'We could not place your order. Please try again.')
        }
        if (data.code === 'cart_changed' || data.code === 'price_changed') setRefresh((n) => n + 1)
        submitGuard.current = false
        setSubmitting(false)
        return
      }

      setRedirecting(true)
      cart.clear()
      if (method === 'prepaid' && data.payment) {
        try {
          await launchPayment(data.payment)
        } catch {
          router.push(data.orderUrl)
        }
      } else {
        // COD, or a replayed prepaid request: the order page offers "Complete payment"
        router.push(data.orderUrl)
      }
    } catch {
      // The request may have reached the server: keep the key so a retry returns the same order
      setFormError('We could not reach the server. Check your connection and try again.')
      submitGuard.current = false
      setSubmitting(false)
    }
  }

  if (redirecting) {
    return (
      <p role="status" className="mt-4 text-xl font-extrabold">
        Order placed. Taking you to the next step…
      </p>
    )
  }

  if (!cart.loaded) {
    return (
      <p role="status" className="mt-4 font-bold text-softer">
        Loading your cart…
      </p>
    )
  }

  if (cart.lines.length === 0) {
    return (
      <div className={`${card} mt-4 flex flex-col items-start gap-4`}>
        <p className="text-xl font-extrabold">Your cart is empty</p>
        <Link
          href="/shop"
          className="rounded-2xl border-[3px] border-ink bg-sun px-5 py-3 text-lg font-extrabold text-ink shadow-[4px_4px_0_var(--color-ink)]"
        >
          Shop all products
        </Link>
      </div>
    )
  }

  const codeApplied = quote?.discountCode && quote.discountCode === appliedCode
  const codeMessage = current?.quote?.codeError ?? null
  const blocked = submitting || loading || unserviceable || !quote || quote.lines.length === 0

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
      <fieldset className={card}>
        <legend className="sr-only">Contact</legend>
        <h2 className={cardTitle} aria-hidden="true">
          Contact
        </h2>
        <div className="flex flex-col gap-3.5">
          <TextField id={FIELD_IDS.name} label="Full name" autoComplete="name" value={fields.name} onChange={set('name')} error={errors.name} />
          <TextField id={FIELD_IDS.phone} label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" value={fields.phone} onChange={set('phone')} error={errors.phone} />
          <TextField id={FIELD_IDS.email} label="Email (optional)" type="email" inputMode="email" autoComplete="email" value={fields.email} onChange={set('email')} error={errors.email} />
        </div>
      </fieldset>

      <fieldset className={card}>
        <legend className="sr-only">Delivery address</legend>
        <h2 className={cardTitle} aria-hidden="true">
          Delivery address
        </h2>
        <div className="flex flex-col gap-3.5">
          <TextField id={FIELD_IDS.line1} label="Address line 1" autoComplete="address-line1" value={fields.line1} onChange={set('line1')} error={errors.line1} />
          <TextField id={FIELD_IDS.line2} label="Address line 2 (optional)" autoComplete="address-line2" value={fields.line2} onChange={set('line2')} error={errors.line2} />
          <TextField id={FIELD_IDS.landmark} label="Landmark (optional)" value={fields.landmark} onChange={set('landmark')} error={errors.landmark} />
          <TextField
            id={FIELD_IDS.pincode}
            label="Pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={fields.pincode}
            onChange={(v) => set('pincode')(v.replace(/\D/g, ''))}
            error={errors.pincode}
            note={delivery ? <span className={delivery.serviceable ? '' : 'text-[#b3261e]'}>{delivery.message}</span> : null}
          />
          <TextField id={FIELD_IDS.city} label="City" autoComplete="address-level2" value={fields.city} onChange={set('city')} error={errors.city} />
          <div>
            <label htmlFor={FIELD_IDS.state} className={labelClass}>
              State
            </label>
            <select
              id={FIELD_IDS.state}
              autoComplete="address-level1"
              value={fields.state}
              onChange={(e) => set('state')(e.target.value)}
              aria-invalid={errors.state ? true : undefined}
              aria-describedby={errors.state ? 'co-state-error' : undefined}
              className={inputClass}
            >
              <option value="">Choose state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.state ? (
              <p id="co-state-error" className={errorClass}>
                {errors.state}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <section className={card} aria-labelledby="co-code-title">
        <h2 id="co-code-title" className={cardTitle}>
          Discount
        </h2>
        {codeApplied ? (
          <div className="flex items-center justify-between gap-3">
            <p role="status" className="text-lg font-extrabold">
              {quote.discountCode} applied
            </p>
            <button type="button" onClick={removeCode} className={smallButton}>
              Remove
            </button>
          </div>
        ) : (
          <>
            <label htmlFor="co-code" className={labelClass}>
              Discount code
            </label>
            <div className="flex gap-2">
              <input
                id="co-code"
                autoCapitalize="characters"
                autoComplete="off"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyCode()
                  }
                }}
                aria-describedby={appliedCode && codeMessage ? 'co-code-error' : undefined}
                className={`${inputClass} flex-1`}
              />
              <button type="button" onClick={applyCode} className={smallButton}>
                Apply
              </button>
            </div>
            {appliedCode && codeMessage ? (
              <div className="mt-1.5 flex items-start justify-between gap-3">
                <p id="co-code-error" role="alert" className="text-[15px] font-bold text-[#b3261e]">
                  {codeMessage}
                </p>
                <button type="button" onClick={removeCode} className="text-[15px] font-bold underline">
                  Remove
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <fieldset className={card}>
        <legend className="sr-only">Payment</legend>
        <h2 className={cardTitle} aria-hidden="true">
          Payment
        </h2>
        <div className="flex flex-col gap-3">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-[2.5px] border-ink p-3.5 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-cobalt ${method === 'prepaid' ? 'bg-butter' : 'bg-white'}`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="prepaid"
              checked={method === 'prepaid'}
              onChange={() => setMethod('prepaid')}
              className="size-5 accent-cobalt"
            />
            <span className="flex flex-1 flex-wrap items-center justify-between gap-x-3 text-base font-extrabold">
              Pay online
              {prepaidSaving > 0 ? (
                <span className="rounded-full border-2 border-ink bg-mint px-2.5 py-0.5 text-sm font-bold">
                  Save {formatINR(prepaidSaving)}
                </span>
              ) : null}
            </span>
          </label>
          <label
            className={`flex items-center gap-3 rounded-xl border-[2.5px] border-ink p-3.5 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-cobalt ${codOk ? `cursor-pointer ${method === 'cod' ? 'bg-butter' : 'bg-white'}` : 'bg-white text-soft'}`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="cod"
              checked={method === 'cod'}
              disabled={!codOk}
              onChange={() => setMethod('cod')}
              aria-describedby={!codOk ? 'co-cod-reason' : undefined}
              className="size-5 accent-cobalt"
            />
            <span className="flex-1 text-base font-extrabold">
              Cash on delivery
              {quote && !quote.cod.eligible ? (
                <span id="co-cod-reason" className="block text-[15px] font-bold text-soft">
                  {quote.cod.reason}
                </span>
              ) : null}
            </span>
          </label>
        </div>
      </fieldset>

      <OrderSummary
        quote={quote}
        loading={loading}
        failed={failed}
        onEditCart={() => cart.setOpen(true)}
        onRetry={() => setRefresh((n) => n + 1)}
      />

      {/* Honeypot: people never see or reach it, bots fill it */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {turnstile.mode === 'live' && turnstile.siteKey ? (
        <TurnstileField
          ref={turnstileRef}
          siteKey={turnstile.siteKey}
          onToken={(t) => {
            setToken(t)
            if (t) setSecurityError(false)
          }}
          onError={() => {
            setToken('')
            setSecurityError(true)
          }}
        />
      ) : null}
      {securityError ? (
        <p role="alert" className="text-[15px] font-bold text-[#b3261e]">
          We couldn&apos;t load the security check. Please refresh the page.
        </p>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-xl border-[3px] border-ink bg-white p-3 text-base font-bold text-[#b3261e]">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={blocked}
        className="rounded-2xl border-[3px] border-ink bg-cobalt px-6 py-3.5 text-center text-[19px] font-extrabold text-white shadow-[4px_4px_0_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Placing your order…' : 'Place order'}
      </button>
    </form>
  )
}
