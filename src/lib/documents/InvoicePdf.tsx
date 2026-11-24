import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import React from 'react'

import type { Invoice, InvoiceLine, InvoiceParty } from '@/lib/commerce/invoice'

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const INK = '#1E1B4B'

/** DD-MM-YYYY on the IST calendar. */
export function formatInvoiceDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`
}

// Helvetica has no rupee glyph, so amounts are written with "Rs."
const money = (paise: number): string =>
  `Rs.${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const COLS = [
  { key: '#', width: 3, align: 'left' },
  { key: 'Description', width: 17, align: 'left' },
  { key: 'HSN', width: 7, align: 'left' },
  { key: 'Qty', width: 4, align: 'right' },
  { key: 'Rate (incl. GST)', width: 10, align: 'right' },
  { key: 'Discount', width: 8, align: 'right' },
  { key: 'Taxable value', width: 10, align: 'right' },
  { key: 'GST %', width: 5, align: 'right' },
  { key: 'CGST', width: 8, align: 'right' },
  { key: 'SGST', width: 8, align: 'right' },
  { key: 'IGST', width: 8, align: 'right' },
  { key: 'Total', width: 10, align: 'right' },
] as const

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Helvetica', fontSize: 8, color: INK },
  warnings: { borderWidth: 1, borderColor: '#E5484D', backgroundColor: '#FDECEC', padding: 6, marginBottom: 8 },
  warning: { color: '#B42318', fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 10 },
  row: { flexDirection: 'row' },
  half: { flex: 1, paddingRight: 8 },
  label: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  name: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 2 },
  meta: { marginTop: 8, marginBottom: 8 },
  head: { flexDirection: 'row', backgroundColor: INK, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
  line: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#C9C7D8' },
  cell: { padding: 3 },
  totals: { marginTop: 8, alignSelf: 'flex-end', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  grand: { fontFamily: 'Helvetica-Bold', fontSize: 10, borderTopWidth: 1, borderTopColor: INK, marginTop: 2, paddingTop: 3 },
  words: { marginTop: 8, fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 20, left: 28, right: 28, textAlign: 'center', color: '#6B6890' },
})

const widthOf = (w: number) => `${w}%`

function Party({ title, party }: { title: string; party: InvoiceParty }) {
  return (
    <View style={styles.half}>
      <Text style={styles.label}>{title}</Text>
      <Text style={styles.name}>{party.name}</Text>
      {party.gstin ? <Text>GSTIN: {party.gstin}</Text> : null}
      {party.lines.map((l, i) => (
        <Text key={i}>{l}</Text>
      ))}
      <Text>
        State: {party.state}
        {party.stateCode ? ` (${party.stateCode})` : ''}
      </Text>
    </View>
  )
}

function Line({ line, index }: { line: InvoiceLine; index: number | null }) {
  const values = [
    index === null ? '' : String(index),
    line.description,
    line.hsn,
    String(line.qty),
    money(line.unitPrice * 100),
    money(line.discountPaise),
    money(line.taxablePaise),
    `${line.rate}%`,
    money(line.cgstPaise),
    money(line.sgstPaise),
    money(line.igstPaise),
    money(line.totalPaise),
  ]
  return (
    <View style={styles.line} wrap={false}>
      {COLS.map((c, i) => (
        <Text key={c.key} style={[styles.cell, { width: widthOf(c.width), textAlign: c.align }]}>
          {values[i]}
        </Text>
      ))}
    </View>
  )
}

export function InvoicePdf({ invoice }: { invoice: Invoice }) {
  const { totals } = invoice
  return (
    <Document title={`Tax Invoice ${invoice.number}`}>
      <Page size="A4" style={styles.page}>
        {invoice.warnings.length ? (
          <View style={styles.warnings}>
            {invoice.warnings.map((w) => (
              <Text key={w} style={styles.warning}>
                {w}
              </Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.title}>Tax Invoice</Text>
        <View style={styles.row}>
          <Party title="Sold by" party={invoice.seller} />
          <Party title="Bill to / Ship to" party={invoice.buyer} />
        </View>
        <View style={[styles.row, styles.meta]}>
          <View style={styles.half}>
            <Text>Invoice no.: {invoice.number}</Text>
            <Text>Invoice date: {formatInvoiceDate(invoice.date)}</Text>
          </View>
          <View style={styles.half}>
            <Text>Place of supply: {invoice.placeOfSupply}</Text>
          </View>
        </View>

        <View style={styles.head} wrap={false}>
          {COLS.map((c) => (
            <Text key={c.key} style={[styles.cell, { width: widthOf(c.width), textAlign: c.align }]}>
              {c.key}
            </Text>
          ))}
        </View>
        {invoice.lines.map((line, i) => (
          <Line key={i} line={line} index={i + 1} />
        ))}
        {invoice.shipping ? <Line line={invoice.shipping} index={invoice.lines.length + 1} /> : null}

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text>Taxable value</Text>
            <Text>{money(totals.taxablePaise)}</Text>
          </View>
          {totals.cgstPaise > 0 || totals.sgstPaise > 0 ? (
            <>
              <View style={styles.totalRow}>
                <Text>CGST</Text>
                <Text>{money(totals.cgstPaise)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text>SGST</Text>
                <Text>{money(totals.sgstPaise)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.totalRow}>
              <Text>IGST</Text>
              <Text>{money(totals.igstPaise)}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.grand]}>
            <Text>Grand total</Text>
            <Text>{money(totals.grandTotal * 100)}</Text>
          </View>
        </View>
        <Text style={styles.words}>Amount in words: {invoice.amountInWords}</Text>
        <Text style={styles.footer} fixed>
          This is a computer-generated invoice.
        </Text>
      </Page>
    </Document>
  )
}
