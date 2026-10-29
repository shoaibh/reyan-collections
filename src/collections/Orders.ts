import type { CollectionConfig, Field } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../lib/commerce/orderStateMachine'

const ro = { readOnly: true } as const
const text = (name: string, extra: Partial<Field> = {}): Field =>
  ({ name, type: 'text', admin: ro, ...extra }) as Field
const num = (name: string, extra: Partial<Field> = {}): Field =>
  ({ name, type: 'number', admin: ro, ...extra }) as Field
const date = (name: string): Field => ({ name, type: 'date', admin: ro })

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'status', 'paymentMethod', 'total', 'createdAt'],
  },
  access: {
    read: isAdmin,
    update: isAdmin,
    create: () => false,
    delete: () => false,
  },
  fields: [
    text('orderNumber', { unique: true, required: true }),
    text('accessToken', { required: true, admin: { ...ro, hidden: true } }),
    {
      name: 'status',
      type: 'select',
      options: [...ORDER_STATUSES],
      required: true,
      index: true,
      admin: ro,
    },
    {
      name: 'paymentMethod',
      type: 'select',
      options: ['prepaid', 'cod'],
      admin: ro,
    },
    { name: 'paymentStatus', type: 'select', options: [...PAYMENT_STATUSES], admin: ro },
    {
      name: 'customer',
      type: 'group',
      admin: ro,
      fields: [text('name'), text('phone', { index: true }), text('email')],
    },
    {
      name: 'address',
      type: 'group',
      admin: ro,
      fields: [
        text('line1'),
        text('line2'),
        text('landmark'),
        text('city'),
        text('state'),
        text('stateCode'),
        text('pincode'),
      ],
    },
    {
      name: 'items',
      type: 'array',
      admin: ro,
      fields: [
        num('productId'),
        text('variantId'),
        text('title'),
        text('variantName'),
        text('slug'),
        num('unitPrice'),
        num('qty'),
        text('hsnCode'),
        num('gstRate'),
        num('weightGrams'),
        num('lengthCm'),
        num('widthCm'),
        num('heightCm'),
      ],
    },
    num('subtotal'),
    text('discountCode', { index: true }),
    num('codeDiscount'),
    num('shippingFee'),
    num('prepaidDiscount'),
    num('total'),
    {
      name: 'razorpay',
      type: 'group',
      admin: ro,
      fields: [text('orderId', { index: true }), text('paymentId'), text('refundId')],
    },
    {
      name: 'shipment',
      type: 'group',
      admin: ro,
      fields: [
        text('shiprocketOrderId'),
        text('shipmentId'),
        text('awb'),
        text('courierName'),
        text('trackingUrl'),
        text('labelUrl'),
        {
          name: 'events',
          type: 'array',
          admin: ro,
          fields: [text('status'), date('at'), { name: 'raw', type: 'json', admin: ro }],
        },
      ],
    },
    {
      name: 'invoice',
      type: 'group',
      admin: ro,
      fields: [text('number'), date('issuedAt')],
    },
    {
      name: 'timeline',
      type: 'array',
      admin: ro,
      fields: [
        text('status'),
        date('at'),
        { name: 'by', type: 'select', options: ['system', 'admin'], admin: ro },
        text('note'),
      ],
    },
    {
      name: 'meta',
      type: 'group',
      admin: ro,
      fields: [
        text('ipHash'),
        text('userAgent'),
        { name: 'turnstileVerified', type: 'checkbox', admin: ro },
        text('idempotencyKey', { unique: true }),
      ],
    },
    {
      name: 'alert',
      type: 'group',
      admin: ro,
      fields: [text('message'), { name: 'handled', type: 'checkbox', admin: ro }],
    },
    { name: 'notes', type: 'textarea' },
  ],
}
