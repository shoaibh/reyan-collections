import { describe, expect, it } from 'vitest'

import { codConfirmMessage, itemSummary, shortName } from '@/lib/commerce/messages'
import type { Order } from '@/payload-types'

type Items = Order['items']
const line = (title: string, variantName = 'Default', qty = 1) => ({ title, variantName, qty })

describe('itemSummary', () => {
  it('shows a single item by its title', () => {
    expect(itemSummary([line('Duck climbing track toy')] as Items)).toBe('Duck climbing track toy')
  })

  it('adds the variant and quantity when they matter', () => {
    expect(itemSummary([line('Container set', 'Sand', 2)] as Items)).toBe('Container set (Sand) ×2')
  })

  it('shows the first two items and counts the rest', () => {
    const items = [line('A'), line('B'), line('C'), line('D')] as Items
    expect(itemSummary(items)).toBe('A, B and 2 more')
  })
})

describe('codConfirmMessage', () => {
  it('builds the WhatsApp confirmation text', () => {
    const order = {
      orderNumber: 'RC1042',
      total: 549,
      customer: { name: 'Priya Sharma', phone: '9876500001' },
      address: { city: 'Lucknow', pincode: '226010' },
      items: [line('Duck climbing track toy')],
    } as Order
    expect(codConfirmMessage(order, 'Reyan Collections')).toBe(
      "Hi Priya! This is Reyan Collections. You ordered Duck climbing track toy (₹549, cash on delivery) to Lucknow 226010. Reply YES to confirm and we'll ship it soon. Order RC1042.",
    )
  })
})

describe('shortName', () => {
  it('shortens a full name to first name and last initial', () => {
    expect(shortName('Priya Sharma')).toBe('Priya S.')
  })

  it('leaves a single word unchanged', () => {
    expect(shortName('Priya')).toBe('Priya')
  })
})
