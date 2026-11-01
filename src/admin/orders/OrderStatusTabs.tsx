'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import React from 'react'

import styles from './panel.module.css'

const TABS: { label: string; statuses: string[] }[] = [
  { label: 'All', statuses: [] },
  { label: 'To confirm', statuses: ['awaiting_confirmation'] },
  { label: 'To ship', statuses: ['confirmed'] },
  { label: 'Booked', statuses: ['ready_to_ship'] },
  { label: 'On the way', statuses: ['shipped', 'out_for_delivery'] },
  { label: 'Delivered', statuses: ['delivered'] },
  { label: 'Cancelled', statuses: ['cancelled'] },
]

const BASE = '/admin/collections/orders'

/** Payload's list query format: where[status][in][0]=a&where[status][in][1]=b */
const hrefFor = (statuses: string[]): string =>
  statuses.length ? `${BASE}?${statuses.map((s, i) => `where[status][in][${i}]=${s}`).join('&')}` : BASE

const OrderStatusTabs: React.FC = () => {
  const params = useSearchParams()
  const active = [...params.entries()]
    .filter(([k]) => /^where\[status\]\[in\]\[\d+\]$/.test(k))
    .map(([, v]) => v)
    .sort()
    .join(',')

  return (
    <nav aria-label="Order status" className={styles.tabs}>
      {TABS.map((tab) => {
        const on = active === [...tab.statuses].sort().join(',')
        return (
          <Link
            key={tab.label}
            href={hrefFor(tab.statuses)}
            className={`${styles.tab} ${on ? styles.tabOn : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default OrderStatusTabs
