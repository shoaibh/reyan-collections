import { sql } from '@payloadcms/db-postgres'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  Field,
  TextFieldSingleValidation,
} from 'payload'

import { isAdmin } from '../access/isAdmin'
import { publishedOrAdmin } from '../access/publishedOrAdmin'
import { slugField } from '../fields/slug'
import { drizzleFor } from '../lib/commerce/db'
import { revalidate } from '../lib/revalidate'
import { safeUrl, wholeNumber } from '../lib/validators'

const marketplaceOptions = ['amazon', 'flipkart', 'meesho']

const requiredWithComparePrice = (label: string) => (value: unknown, { siblingData }: { siblingData: unknown }) => {
  const price = (siblingData as { price?: number | null } | undefined)?.price
  if (typeof price === 'number' && (value === undefined || value === null || value === '')) {
    return `${label} is required when a comparison price is set`
  }
  return true
}

const dimension = (name: string): Field => ({
  name,
  type: 'number',
  required: true,
  validate: wholeNumber(1, 'units'),
})

type VariantRow = { id?: string; name?: string; stock?: number; stockAtLoad?: number | null }

/**
 * R7: write only what the editor changed. Checkout decrements `variants.stock` directly, so a
 * stale form (or an older draft) must not write its old stock back. The admin form submits
 * `stockAtLoad` (the stock it loaded); an unchanged stock keeps the live value.
 */
const protectVariantStock: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !Array.isArray(data?.variants)) return data
  // `originalDoc` is the latest version, which may be a stale draft. Live stock sits in the main
  // table, where checkout decrements it, so an untouched row takes its stock from there (R8).
  const db = await drizzleFor(req.payload, req.transactionID)
  const { rows } = await db.execute(
    sql`SELECT id, stock::int AS stock FROM products_variants WHERE _parent_id = ${originalDoc.id} FOR UPDATE`,
  )
  const liveStock = new Map(rows.map((r) => [String(r.id), Number(r.stock)]))
  const original: VariantRow[] = Array.isArray(originalDoc?.variants) ? originalDoc.variants : []
  const originalIds = new Set(original.map((o) => o.id))
  const incoming = data.variants as VariantRow[]
  // Rows that carry an id from the original claim it first
  const claimed = new Set<string>(incoming.flatMap((row) => (row.id && originalIds.has(row.id) ? [row.id] : [])))

  data.variants = incoming.map((row) => {
    // Payload assigns a fresh id to rows submitted without one before this hook runs, so a row
    // whose id is unknown to the original falls back to matching by name.
    let match = row.id ? original.find((o) => o.id === row.id) : undefined
    if (!match) {
      match = original.find((o) => o.id && !claimed.has(o.id) && o.name === row.name)
      if (match?.id) claimed.add(match.id)
    }
    if (!match) return row
    const next: VariantRow = { ...row, id: match.id }
    const untouched =
      typeof row.stockAtLoad === 'number' && row.stock === row.stockAtLoad && typeof match.stock === 'number'
    if (untouched) next.stock = (match.id ? liveStock.get(match.id) : undefined) ?? match.stock
    return next
  })
  return data
}

const revalidateProduct: CollectionAfterChangeHook = ({ doc, previousDoc }) => {
  const tags = ['products']
  if (doc?.slug) tags.push(`product:${doc.slug}`)
  if (previousDoc?.slug && previousDoc.slug !== doc?.slug) tags.push(`product:${previousDoc.slug}`)
  revalidate(tags)
  return doc
}

const revalidateProductDelete: CollectionAfterDeleteHook = ({ doc }) => {
  revalidate(['products', ...(doc?.slug ? [`product:${doc.slug}`] : [])])
  return doc
}

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'title',
  },
  versions: { drafts: true },
  hooks: {
    beforeChange: [protectVariantStock],
    afterChange: [revalidateProduct],
    afterDelete: [revalidateProductDelete],
  },
  access: {
    read: publishedOrAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'images',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      minRows: 1,
      required: true,
    },
    { name: 'boxImage', type: 'upload', relationTo: 'media' },
    {
      name: 'price',
      type: 'number',
      required: true,
      validate: wholeNumber(1),
    },
    {
      name: 'compareAt',
      type: 'group',
      fields: [
        {
          name: 'marketplace',
          type: 'select',
          options: marketplaceOptions,
          validate: requiredWithComparePrice('Marketplace'),
        },
        { name: 'price', type: 'number', validate: wholeNumber(1) },
        {
          name: 'url',
          type: 'text',
          validate: ((value, args) => {
            const required = requiredWithComparePrice('URL')(value, args)
            return required === true ? safeUrl(value, args) : required
          }) as TextFieldSingleValidation,
        },
        {
          name: 'checkedOn',
          type: 'date',
          validate: requiredWithComparePrice('Checked on date'),
        },
      ],
    },
    {
      name: 'marketplaceLinks',
      type: 'array',
      fields: [
        { name: 'marketplace', type: 'select', options: marketplaceOptions, required: true },
        { name: 'url', type: 'text', required: true, validate: safeUrl },
      ],
    },
    {
      name: 'variants',
      type: 'array',
      minRows: 1,
      required: true,
      fields: [
        { name: 'name', type: 'text', required: true },
        {
          name: 'swatch',
          type: 'text',
          validate: (value: string | null | undefined) => {
            if (!value) return true
            return /^#[0-9A-Fa-f]{6}$/.test(value) || 'Must be a hex colour like #A8E6CF'
          },
        },
        { name: 'images', type: 'upload', relationTo: 'media', hasMany: true },
        {
          name: 'stock',
          type: 'number',
          required: true,
          defaultValue: 0,
          validate: wholeNumber(0, 'units'),
        },
        { name: 'sku', type: 'text' },
        {
          // Not stored: echoes the stock the editor loaded so a save can tell an edit from a stale value
          name: 'stockAtLoad',
          type: 'number',
          virtual: true,
          admin: { hidden: true },
          hooks: {
            afterRead: [({ siblingData }) => (siblingData as { stock?: number } | undefined)?.stock],
          },
        },
      ],
    },
    {
      name: 'badge',
      type: 'select',
      defaultValue: 'none',
      options: ['none', 'bestseller', 'new', 'limited'],
    },
    { name: 'category', type: 'relationship', relationTo: 'categories', required: true },
    { name: 'shortDescription', type: 'textarea' },
    { name: 'description', type: 'richText' },
    {
      name: 'highlights',
      type: 'array',
      fields: [{ name: 'text', type: 'text' }],
    },
    { name: 'ageGroup', type: 'text' },
    { name: 'bisNumber', type: 'text' },
    {
      name: 'tax',
      type: 'group',
      fields: [
        {
          name: 'hsnCode',
          type: 'text',
          required: true,
          validate: (value: string | null | undefined) => {
            if (!value) return 'HSN code is required'
            return /^\d{4,8}$/.test(value) || 'HSN code must be 4 to 8 digits'
          },
        },
        {
          name: 'gstRate',
          type: 'number',
          required: true,
          validate: (value: number | null | undefined) => {
            if (value === undefined || value === null) return 'GST rate is required'
            return [0, 5, 12, 18, 28].includes(value) || 'GST rate must be one of 0, 5, 12, 18, 28'
          },
        },
      ],
    },
    {
      name: 'shipping',
      type: 'group',
      fields: [
        dimension('weightGrams'),
        dimension('lengthCm'),
        dimension('widthCm'),
        dimension('heightCm'),
      ],
    },
    { name: 'codAllowed', type: 'checkbox', defaultValue: true },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
        { name: 'image', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
