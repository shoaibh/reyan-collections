import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { getTodayData } from '@/lib/commerce/today'
import { formatINR } from '@/lib/format'

import TodayActions from './TodayActions'
import styles from './today.module.css'

const ON_THE_WAY_HREF =
  '/admin/collections/orders?where[status][in][0]=shipped&where[status][in][1]=out_for_delivery'

const Empty: React.FC<{ children: string }> = ({ children }) => <p className={styles.empty}>{children}</p>

const Card: React.FC<{ tone?: 'amber' | 'blue' | 'red' | 'green'; title: string; count?: number; children: React.ReactNode }> = ({
  tone,
  title,
  count,
  children,
}) => (
  <section className={`${styles.card} ${tone ? styles[tone] : ''}`}>
    <div className={styles.cardHead}>
      <h2>{title}</h2>
      {count !== undefined ? <span className={styles.count}>{count}</span> : null}
    </div>
    {children}
  </section>
)

/** Payload's dashboard view: what needs the owner now, this week's numbers, quick actions. */
const TodayView: React.FC<AdminViewServerProps> = async ({ initPageResult }) => {
  const { req } = initPageResult
  const name = (req.user as { name?: string | null } | null)?.name ?? null
  const today = await getTodayData(req.payload, new Date(), name)
  const onTheWay = today.onTheWay.inTransit + today.onTheWay.outForDelivery

  return (
    <div className={styles.today}>
      <header className={styles.heading}>
        <p>{today.greeting}</p>
        <h1>
          {today.needsYou === 0 ? 'All caught up' : `${today.needsYou} ${today.needsYou === 1 ? 'thing needs' : 'things need'} you`}
        </h1>
      </header>

      <section className={styles.week} aria-label="This week">
        <div>
          <small>This week</small>
          <b>{formatINR(today.week.revenue)}</b>
          <small>{today.week.orders === 1 ? '1 order' : `${today.week.orders} orders`}</small>
        </div>
        <div className={styles.chips}>
          <span>{today.week.prepaid} prepaid</span>
          <span>{today.week.cod} COD</span>
        </div>
      </section>

      <Card tone="amber" title="Confirm COD orders" count={today.confirmCod.length}>
        {today.confirmCod.length === 0 ? (
          <Empty>Nothing to confirm</Empty>
        ) : (
          today.confirmCod.map((row) => (
            <div className={styles.row} key={row.id}>
              <Link className={styles.meta} href={`/admin/collections/orders/${row.id}`}>
                <b>{row.title}</b>
                <small>{row.meta}</small>
              </Link>
              <TodayActions orderId={row.id} action="confirm" whatsappUrl={row.whatsappUrl} />
            </div>
          ))
        )}
      </Card>

      <Card tone="blue" title="Ready to ship" count={today.readyToShip.length}>
        {today.readyToShip.length === 0 ? (
          <Empty>Nothing to ship</Empty>
        ) : (
          today.readyToShip.map((row) => (
            <div className={styles.row} key={row.id}>
              <Link className={styles.meta} href={`/admin/collections/orders/${row.id}`}>
                <b>{row.title}</b>
                <small>{row.meta}</small>
              </Link>
              <TodayActions orderId={row.id} action="ship" />
            </div>
          ))
        )}
        {today.bookedCount > 0 ? (
          <div className={styles.row}>
            <a className={styles.link} href="/api/orders/packing-slips?status=ready_to_ship" target="_blank" rel="noopener noreferrer">
              Print all packing slips →
            </a>
            <small className={styles.booked}>{today.bookedCount} booked, waiting for pickup</small>
          </div>
        ) : null}
      </Card>

      <Card tone="red" title="Low stock" count={today.lowStock.length}>
        {today.lowStock.length === 0 ? (
          <Empty>All stocked up</Empty>
        ) : (
          today.lowStock.map((row) => (
            <div className={styles.row} key={`${row.productId}-${row.title}`}>
              <div className={styles.meta}>
                <b>{row.title}</b>
                <small>{row.meta}</small>
              </div>
              <div className={styles.acts}>
                <Link className={styles.okBtn} href={`/admin/collections/products/${row.productId}`}>
                  Update
                </Link>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card tone="green" title="On the way" count={onTheWay}>
        {onTheWay === 0 ? (
          <Empty>Nothing on the way</Empty>
        ) : (
          <div className={styles.row}>
            <div className={styles.meta}>
              <b>
                {today.onTheWay.inTransit} in transit · {today.onTheWay.outForDelivery} out for delivery
              </b>
              <small>Tracking updates come from Shiprocket</small>
            </div>
            <Link className={styles.link} href={ON_THE_WAY_HREF}>
              View
            </Link>
          </div>
        )}
      </Card>

      {today.alerts.length > 0 ? (
        <Card tone="red" title="Alerts" count={today.alerts.length}>
          {today.alerts.map((alert) => (
            <div className={styles.row} key={`${alert.kind}-${alert.href}`}>
              <Link className={styles.meta} href={alert.href}>
                <b>{alert.title}</b>
              </Link>
            </div>
          ))}
        </Card>
      ) : null}

      <Card title="Quick actions">
        <div className={styles.two}>
          <Link href="/admin/collections/products/create">+ Add product</Link>
          <Link href="/admin/globals/homepage">Edit homepage</Link>
          <Link href="/admin/globals/links-page">Edit links page</Link>
          <Link href="/admin/globals/store-settings">Store settings</Link>
        </div>
      </Card>
    </div>
  )
}

export default TodayView
