import type { Payload, Where } from 'payload'

import { formatINR } from '@/lib/format'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import type { Order, Product } from '@/payload-types'

import { codConfirmMessage, itemSummary, shortName } from './messages'
import { autoCancelLabelOf } from './orderPanel'
import { loadCommerceSettings } from './settings'

export type TodayData = {
  greeting: string
  needsYou: number
  week: { revenue: number; orders: number; prepaid: number; cod: number }
  confirmCod: { id: number; title: string; meta: string; whatsappUrl: string }[]
  readyToShip: { id: number; title: string; meta: string }[]
  bookedCount: number
  lowStock: { productId: number; title: string; meta: string }[]
  onTheWay: { inTransit: number; outForDelivery: number }
  alerts: { kind: 'payment' | 'creditNote' | 'staleCompare'; title: string; href: string; orderId?: number }[]
}

const LOW_STOCK_AT_MOST = 3
const STALE_COMPARE_DAYS = 30
const DAY_MS = 86_400_000
// India has no daylight saving: IST is always UTC+5:30
const IST_OFFSET_MS = 19_800_000

/** The IST wall clock as a UTC date: read it with the getUTC* methods, never the machine's time zone. */
const istClock = (at: Date): Date => new Date(at.getTime() + IST_OFFSET_MS)

function greetingFor(now: Date, name: string | null): string {
  const hour = istClock(now).getUTCHours()
  const base = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return name?.trim() ? `${base}, ${name.trim()}` : base
}

/** The most recent Monday 00:00 IST at or before `now`. */
function mondayStart(now: Date): Date {
  const ist = istClock(now)
  const sinceMonday = (ist.getUTCDay() + 6) % 7
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - sinceMonday) - IST_OFFSET_MS)
}

function ageLabel(createdAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

const orderHref = (id: number) => `/admin/collections/orders/${id}`
const productHref = (id: number) => `/admin/collections/products/${id}`

export async function getTodayData(payload: Payload, now: Date, adminName: string | null): Promise<TodayData> {
  const weekStart = mondayStart(now)
  const soldSince = new Date(now.getTime() - 7 * DAY_MS)
  const staleBefore = new Date(now.getTime() - STALE_COMPARE_DAYS * DAY_MS)
  const recentSince = weekStart < soldSince ? weekStart : soldSince

  const oldestFirst = (status: string) =>
    payload.find({
      collection: 'orders',
      where: { status: { equals: status } },
      sort: 'createdAt',
      limit: 100,
      pagination: false,
      depth: 0,
    })
  const countStatus = (status: string) =>
    payload.count({ collection: 'orders', where: { status: { equals: status } } }).then((r) => r.totalDocs)
  const recentWhere: Where = {
    and: [
      { createdAt: { greater_than_equal: recentSince.toISOString() } },
      { createdAt: { less_than_equal: now.toISOString() } },
      // Cancelled orders and unpaid online checkouts (they expire within the hour) are not revenue or sales
      { status: { not_in: ['cancelled', 'pending_payment'] } },
    ],
  }

  const [settings, global, awaiting, confirmed, booked, inTransit, outForDelivery, recent, flagged, products] =
    await Promise.all([
      loadCommerceSettings(payload),
      payload.findGlobal({ slug: 'store-settings', depth: 0 }),
      oldestFirst('awaiting_confirmation'),
      oldestFirst('confirmed'),
      countStatus('ready_to_ship'),
      countStatus('shipped'),
      countStatus('out_for_delivery'),
      payload.find({
        collection: 'orders',
        where: recentWhere,
        pagination: false,
        depth: 0,
        select: { createdAt: true, paymentMethod: true, total: true, items: true },
      }),
      payload.find({
        collection: 'orders',
        where: { or: [{ 'alert.message': { exists: true } }, { 'creditNote.needed': { equals: true } }] },
        sort: 'createdAt',
        pagination: false,
        depth: 0,
      }),
      payload.find({
        collection: 'products',
        where: { _status: { equals: 'published' } },
        pagination: false,
        depth: 0,
        select: { title: true, variants: true, compareAt: true },
      }),
    ])

  const storeName = global.business?.name || 'Reyan Collections'

  const week = { revenue: 0, orders: 0, prepaid: 0, cod: 0 }
  const sold = new Map<string, number>()
  for (const order of recent.docs) {
    const created = new Date(order.createdAt)
    if (created >= weekStart) {
      week.orders++
      week.revenue += order.total ?? 0
      if (order.paymentMethod === 'cod') week.cod++
      else week.prepaid++
    }
    if (created >= soldSince) {
      for (const item of order.items ?? []) {
        const key = `${item.productId}:${item.variantId}`
        sold.set(key, (sold.get(key) ?? 0) + (item.qty ?? 0))
      }
    }
  }

  const confirmCod = awaiting.docs.map((order) => {
    const countdown = autoCancelLabelOf(order, settings, now)
    const meta = [
      itemSummary(order.items),
      formatINR(order.total ?? 0),
      `${ageLabel(order.createdAt, now)} ago`,
      countdown ? countdown.toLowerCase() : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return {
      id: order.id,
      title: `#${order.orderNumber} · ${shortName(order.customer?.name ?? '')}`,
      meta,
      whatsappUrl: buildWhatsAppLink(order.customer?.phone ?? '', codConfirmMessage(order, storeName)),
    }
  })

  const readyToShip = confirmed.docs.map((order) => ({
    id: order.id,
    title: `#${order.orderNumber} · ${itemSummary(order.items)}`,
    meta: `${order.paymentMethod === 'cod' ? 'COD confirmed' : 'Prepaid'} · ${order.address?.city ?? ''} ${order.address?.pincode ?? ''}`.trim(),
  }))

  const lowStock: (TodayData['lowStock'][number] & { stock: number })[] = []
  for (const product of products.docs as Pick<Product, 'id' | 'title' | 'variants'>[]) {
    for (const variant of product.variants ?? []) {
      const stock = variant.stock ?? 0
      if (stock > LOW_STOCK_AT_MOST) continue
      const soldCount = sold.get(`${product.id}:${variant.id}`) ?? 0
      lowStock.push({
        productId: product.id,
        title: variant.name === 'Default' ? product.title : `${product.title} (${variant.name})`,
        meta: `${stock} left · ${soldCount} sold this week`,
        stock,
      })
    }
  }
  lowStock.sort((a, b) => a.stock - b.stock || a.title.localeCompare(b.title))

  const alerts: TodayData['alerts'] = []
  const flaggedOrders: Order[] = flagged.docs
  for (const order of flaggedOrders) {
    if (order.alert?.message && !order.alert.handled) {
      alerts.push({
        kind: 'payment',
        title: `#${order.orderNumber} · ${order.alert.message}`,
        href: orderHref(order.id),
        orderId: order.id,
      })
    }
  }
  for (const order of flaggedOrders) {
    if (order.creditNote?.needed && !order.creditNote.handled) {
      alerts.push({
        kind: 'creditNote',
        title: `#${order.orderNumber} · Credit note needed (${order.status === 'cancelled' ? 'cancelled' : 'returned'} after invoicing)`,
        href: orderHref(order.id),
        orderId: order.id,
      })
    }
  }
  const stale = (products.docs as Pick<Product, 'id' | 'title' | 'compareAt'>[])
    .filter((p) => p.compareAt?.checkedOn && new Date(p.compareAt.checkedOn) < staleBefore)
    .sort((a, b) => a.compareAt!.checkedOn!.localeCompare(b.compareAt!.checkedOn!))
  for (const product of stale) {
    alerts.push({ kind: 'staleCompare', title: `Re-check marketplace price: ${product.title}`, href: productHref(product.id) })
  }

  return {
    greeting: greetingFor(now, adminName),
    needsYou: confirmCod.length + readyToShip.length + alerts.length,
    week,
    confirmCod,
    readyToShip,
    bookedCount: booked,
    lowStock: lowStock.map(({ stock: _stock, ...row }) => row),
    onTheWay: { inTransit, outForDelivery },
    alerts,
  }
}
