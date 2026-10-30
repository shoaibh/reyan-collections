import { describe, expect, it } from 'vitest'

import type { Order } from '@/payload-types'
import { renderEmail, type NotifyEvent } from '@/lib/notifications/templates'

const ctx = { siteUrl: 'https://shop.example', storeName: 'Reyan Collections' }

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: 7,
    orderNumber: 'RC1001',
    accessToken: 'tok123',
    status: 'confirmed',
    paymentMethod: 'prepaid',
    customer: { name: 'Asha', phone: '9876543210', email: 'asha@example.com' },
    items: [
      { title: 'Silk Dupatta', variantName: 'Red', qty: 2, unitPrice: 400 },
      { title: 'Kurti', variantName: 'Default', qty: 1, unitPrice: 800 },
    ],
    total: 1649,
    shipment: { trackingUrl: 'https://track.example/abc' },
    ...over,
  }) as Order

describe('renderEmail subjects', () => {
  const cases: [NotifyEvent, string][] = [
    ['order_received', 'We got your order RC1001'],
    ['order_paid', 'Order RC1001 confirmed'],
    ['cod_confirmed', 'Order RC1001 confirmed'],
    ['shipped', 'Your order RC1001 is on its way'],
    ['cancelled', 'Order RC1001 cancelled'],
    ['refunded', 'Refund for order RC1001'],
    ['admin_new_order', 'New order RC1001 · ₹1,649 · Prepaid'],
  ]
  it.each(cases)('%s', (event, subject) => {
    expect(renderEmail(event, order(), ctx).subject).toBe(subject)
  })

  it('labels COD orders for the admin', () => {
    expect(renderEmail('admin_new_order', order({ paymentMethod: 'cod' }), ctx).subject).toBe(
      'New order RC1001 · ₹1,649 · COD',
    )
  })
})

describe('renderEmail bodies', () => {
  it('order_received promises a WhatsApp confirmation', () => {
    expect(renderEmail('order_received', order(), ctx).html).toContain("We'll WhatsApp you shortly to confirm your order.")
  })

  it('lists items (omitting Default), total and the order link', () => {
    const { html } = renderEmail('order_paid', order(), ctx)
    expect(html).toContain('Silk Dupatta — Red')
    expect(html).toContain('× 2')
    expect(html).toContain('Kurti')
    expect(html).not.toContain('Default')
    expect(html).toContain('₹1,649')
    expect(html).toContain('View your order')
    expect(html).toContain('https://shop.example/order/RC1001?t=tok123')
  })

  it('shipped includes the tracking link when present', () => {
    expect(renderEmail('shipped', order(), ctx).html).toContain('https://track.example/abc')
    expect(renderEmail('shipped', order({ shipment: {} }), ctx).html).not.toContain('track.example')
  })

  it('cancelled and refunded state the refund when an amount is given', () => {
    const sentence = 'Your refund of ₹1,649 has been started. It can take 5–7 working days to reach you.'
    expect(renderEmail('cancelled', order(), { ...ctx, refundAmount: 1649 }).html).toContain(sentence)
    expect(renderEmail('refunded', order(), { ...ctx, refundAmount: 1649 }).html).toContain(sentence)
    expect(renderEmail('cancelled', order(), ctx).html).not.toContain('Your refund of')
  })

  it('admin email links to the admin order page', () => {
    expect(renderEmail('admin_new_order', order(), ctx).html).toContain('https://shop.example/admin/collections/orders/7')
  })

  it('escapes interpolated values', () => {
    const { html } = renderEmail(
      'order_received',
      order({ customer: { name: '<b>x</b>', email: 'a@b.c' }, items: [{ title: '<i>t</i>', variantName: 'V', qty: 1 }] }),
      ctx,
    )
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;i&gt;t&lt;/i&gt;')
  })
})
