import type { CollectionAfterReadHook, CollectionConfig, TextFieldSingleValidation } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { normalizeCode } from '../lib/commerce/pricing'
import { wholeNumber } from '../lib/validators'

const CODE_MESSAGE = 'Use 3–20 letters, digits or dashes'

const codeValidate: TextFieldSingleValidation = (value) =>
  (typeof value === 'string' && /^[A-Z0-9-]{3,20}$/.test(value)) || CODE_MESSAGE

/** Fills the virtual `usage` group from non-cancelled orders. Skipped when no user is present. */
const fillUsage: CollectionAfterReadHook = async ({ doc, req }) => {
  if (!req.user || typeof doc?.code !== 'string') return doc
  const { docs } = await req.payload.find({
    collection: 'orders',
    where: { and: [{ discountCode: { equals: doc.code } }, { status: { not_equals: 'cancelled' } }] },
    depth: 0,
    pagination: false,
    select: { total: true },
    req,
  })
  doc.usage = { timesUsed: docs.length, revenue: docs.reduce((sum, order) => sum + (order.total ?? 0), 0) }
  return doc
}

export const DiscountCodes: CollectionConfig = {
  slug: 'discount-codes',
  admin: { useAsTitle: 'code' },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { afterRead: [fillUsage] },
  fields: [
    {
      name: 'code',
      type: 'text',
      unique: true,
      required: true,
      validate: codeValidate,
      hooks: {
        beforeValidate: [({ value }) => (typeof value === 'string' ? normalizeCode(value) : value)],
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Percent', value: 'percent' },
        { label: 'Flat (₹)', value: 'flat' },
      ],
    },
    { name: 'value', type: 'number', required: true, validate: wholeNumber(1) },
    { name: 'maxDiscount', type: 'number', validate: wholeNumber(1) },
    { name: 'minOrderValue', type: 'number', validate: wholeNumber(0) },
    { name: 'validFrom', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'validUntil', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'usageLimit', type: 'number', validate: wholeNumber(1, 'uses') },
    { name: 'perPhoneLimit', type: 'number', defaultValue: 1, validate: wholeNumber(1, 'uses') },
    { name: 'active', type: 'checkbox', defaultValue: true },
    { name: 'note', type: 'text' },
    {
      name: 'usage',
      type: 'group',
      virtual: true,
      admin: { readOnly: true },
      fields: [
        { name: 'timesUsed', type: 'number', virtual: true },
        { name: 'revenue', type: 'number', virtual: true },
      ],
    },
  ],
}
