import type { Field, GlobalConfig, NumberFieldValidation } from 'payload'

import { isAdmin } from '../access/isAdmin'

// Same whole-number pattern as src/collections/Products.ts
const wholeNumber =
  (min: number, unit = 'rupees'): NumberFieldValidation =>
  (value, { required }) => {
    if (value === undefined || value === null) {
      return required ? 'This field is required.' : true
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return `Must be a whole number of ${unit}`
    }
    if (value < min) return `Must be at least ${min}`
    return true
  }

const rating: NumberFieldValidation = (value) => {
  if (value === undefined || value === null) return true
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Must be a number'
  if (value < 0 || value > 5) return 'Rating must be between 0 and 5'
  if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-9) {
    return 'Rating can have at most one decimal place'
  }
  return true
}

const addressFields = (): Field[] => [
  { name: 'line1', type: 'text' },
  { name: 'line2', type: 'text' },
  { name: 'city', type: 'text' },
  { name: 'state', type: 'text' },
  { name: 'stateCode', type: 'text' },
  { name: 'pincode', type: 'text' },
]

export const StoreSettings: GlobalConfig = {
  slug: 'store-settings',
  label: 'Store Settings',
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'business',
      type: 'group',
      fields: [
        { name: 'name', type: 'text', defaultValue: 'Reyan Collections' },
        { name: 'legalName', type: 'text' },
        { name: 'gstin', type: 'text' },
        { name: 'address', type: 'group', fields: addressFields() },
        { name: 'pickupSameAsBusiness', type: 'checkbox', defaultValue: true },
        {
          name: 'pickupAddress',
          type: 'group',
          fields: addressFields(),
          admin: {
            condition: (_data, siblingData) =>
              (siblingData as { pickupSameAsBusiness?: boolean } | undefined)?.pickupSameAsBusiness === false,
          },
        },
        { name: 'whatsappNumber', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'email', type: 'email' },
      ],
    },
    {
      name: 'social',
      type: 'group',
      fields: [
        { name: 'instagramUrl', type: 'text' },
        { name: 'amazonStoreUrl', type: 'text' },
        { name: 'flipkartStoreUrl', type: 'text' },
        { name: 'meeshoStoreUrl', type: 'text' },
        {
          name: 'ratings',
          type: 'group',
          fields: [
            { name: 'amazon', type: 'number', validate: rating },
            { name: 'flipkart', type: 'number', validate: rating },
            { name: 'meesho', type: 'number', validate: rating },
          ],
        },
      ],
    },
    {
      name: 'commerce',
      type: 'group',
      fields: [
        { name: 'shippingFee', type: 'number', defaultValue: 49, validate: wholeNumber(0) },
        { name: 'freeShippingAbove', type: 'number', defaultValue: 499, validate: wholeNumber(0) },
        { name: 'prepaidDiscount', type: 'number', defaultValue: 0, validate: wholeNumber(0) },
        { name: 'codMaxOrderValue', type: 'number', defaultValue: 2000, validate: wholeNumber(0) },
        { name: 'maxPerOrder', type: 'number', defaultValue: 5, validate: wholeNumber(0, 'units') },
        { name: 'returnWindowDays', type: 'number', defaultValue: 7, validate: wholeNumber(0, 'days') },
      ],
    },
    {
      name: 'timeouts',
      type: 'group',
      fields: [
        { name: 'pendingPaymentMinutes', type: 'number', defaultValue: 30, validate: wholeNumber(0, 'minutes') },
        { name: 'codConfirmHours', type: 'number', defaultValue: 24, validate: wholeNumber(0, 'hours') },
      ],
    },
    {
      name: 'invoicing',
      type: 'group',
      fields: [{ name: 'invoicePrefix', type: 'text', defaultValue: 'RC' }],
    },
  ],
}
