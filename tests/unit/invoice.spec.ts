import { describe, expect, it } from 'vitest'

import { buildInvoice, financialYear, formatInvoiceNumber, type InvoiceParty } from '@/lib/commerce/invoice'
import { StoreSettings } from '@/globals/StoreSettings'
import type { Order } from '@/payload-types'

const seller: InvoiceParty = {
  name: 'Reyan Collections',
  gstin: '09ABCDE1234F1Z5',
  lines: ['1 Market Road', 'Lucknow 226001'],
  state: 'Uttar Pradesh',
  stateCode: '09',
}

const meta = { number: 'RC/2026-27/0001', issuedAt: '2026-10-30T10:00:00.000Z' }

const item = (title: string, unitPrice: number, qty: number, gstRate: number, variantName = 'Default') => ({
  title,
  variantName,
  unitPrice,
  qty,
  hsnCode: '9503',
  gstRate,
})

const order = (over: Partial<Order> & { stateCode?: string }): Order => {
  const { stateCode = '09', ...rest } = over
  return {
    id: 1,
    orderNumber: 'RC-1',
    accessToken: 't',
    status: 'confirmed',
    customer: { name: 'Asha', phone: '9999999999' },
    address: {
      line1: '5 Lane',
      line2: null,
      landmark: null,
      city: 'Lucknow',
      state: stateCode === '09' ? 'Uttar Pradesh' : 'Maharashtra',
      stateCode,
      pincode: '226001',
    },
    items: [item('Karaoke Mic', 449, 2, 18)],
    subtotal: 898,
    codeDiscount: 90,
    prepaidDiscount: 0,
    shippingFee: 0,
    total: 808,
    updatedAt: '',
    createdAt: '',
    ...rest,
  } as Order
}

describe('invoice numbering', () => {
  it('formats the number', () => {
    expect(formatInvoiceNumber('RC', '2026-27', 1)).toBe('RC/2026-27/0001')
  })

  it('keeps numbers within 16 characters', () => {
    expect(formatInvoiceNumber('ABC', '2026-27', 9999)).toHaveLength(16)
    expect(() => formatInvoiceNumber('ABCD', '2026-27', 1)).toThrow('Invoice number exceeds 16 characters')
  })

  it('validates the invoice prefix setting', () => {
    const group = StoreSettings.fields.find((f) => 'name' in f && f.name === 'invoicing') as {
      fields: { name: string; validate?: (v: string) => true | string }[]
    }
    const validate = group.fields.find((f) => f.name === 'invoicePrefix')!.validate!
    expect(validate('RC')).toBe(true)
    expect(validate('ABCD')).toBe('Use 1–3 capital letters or digits')
    expect(validate('rc')).toBe('Use 1–3 capital letters or digits')
  })

  it('rolls the financial year at IST midnight on 1 April', () => {
    expect(financialYear(new Date('2027-03-31T18:29:00Z'))).toBe('2026-27')
    expect(financialYear(new Date('2027-03-31T18:30:00Z'))).toBe('2027-28')
    expect(financialYear(new Date('2026-10-30T00:00:00Z'))).toBe('2026-27')
  })
})

describe('buildInvoice', () => {
  it('splits GST into CGST and SGST for an intra-state sale', () => {
    const inv = buildInvoice(order({}), seller, meta)
    expect(inv.intraState).toBe(true)
    expect(inv.lines).toHaveLength(1)
    expect(inv.shipping).toBeNull()
    const l = inv.lines[0]
    expect(l.description).toBe('Karaoke Mic')
    expect(l.grossPaise).toBe(89800)
    expect(l.discountPaise).toBe(9000)
    expect(l.taxablePaise).toBe(68475)
    expect(l.cgstPaise).toBe(6162)
    expect(l.sgstPaise).toBe(6163)
    expect(l.igstPaise).toBe(0)
    expect(inv.totals.grandTotal).toBe(808)
    expect(inv.amountInWords).toBe('Rupees Eight Hundred Eight Only')
    expect(inv.number).toBe(meta.number)
    expect(inv.buyer.name).toBe('Asha')
    expect(inv.warnings).toEqual([])
  })

  it('uses IGST for an inter-state sale', () => {
    const inv = buildInvoice(order({ stateCode: '27' }), seller, meta)
    expect(inv.intraState).toBe(false)
    expect(inv.lines[0].igstPaise).toBe(12325)
    expect(inv.lines[0].cgstPaise).toBe(0)
    expect(inv.lines[0].sgstPaise).toBe(0)
    expect(inv.placeOfSupply).toContain('27')
  })

  it('allocates discounts exactly across mixed rates and adds a shipping line', () => {
    const o = order({
      items: [item('Karaoke Mic', 449, 1, 18, 'Pink'), item('Duck', 299, 2, 12)],
      subtotal: 1047,
      codeDiscount: 100,
      shippingFee: 49,
      total: 996,
    })
    const inv = buildInvoice(o, seller, meta)
    expect(inv.lines[0].description).toBe('Karaoke Mic (Pink)')
    expect(inv.lines[1].description).toBe('Duck')
    expect(inv.lines.reduce((s, l) => s + l.discountPaise, 0)).toBe(10000)
    expect(inv.shipping).not.toBeNull()
    expect(inv.shipping!.description).toBe('Shipping')
    expect(inv.shipping!.hsn).toBe('996812')
    expect(inv.shipping!.rate).toBe(18)
    expect(inv.shipping!.discountPaise).toBe(0)
    expect(inv.shipping!.totalPaise).toBe(4900)
    expect(inv.totals.grandTotal).toBe(996)
    const t = inv.totals
    expect(t.taxablePaise + t.cgstPaise + t.sgstPaise + t.igstPaise).toBe(99600)
  })

  it('gives the leftover paise to the largest remainders', () => {
    const o = order({
      items: [item('A', 1, 1, 0), item('B', 1, 1, 0), item('C', 1, 1, 0)],
      subtotal: 3,
      codeDiscount: 1,
      total: 2,
    })
    const inv = buildInvoice(o, seller, meta)
    expect(inv.lines.map((l) => l.discountPaise)).toEqual([34, 33, 33])
  })

  it('warns and goes inter-state when the seller state or GSTIN is missing', () => {
    const inv = buildInvoice(order({}), { ...seller, stateCode: null, gstin: null }, meta)
    expect(inv.intraState).toBe(false)
    expect(inv.warnings).toContain('Seller state is not set in Store Settings')
    expect(inv.warnings).toContain('GSTIN is not set in Store Settings')
  })

  it('throws when the computed total differs from the order total', () => {
    expect(() => buildInvoice(order({ total: 999 }), seller, meta)).toThrow(
      'Invoice total does not match order total',
    )
  })
})
