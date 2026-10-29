import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'

export const CodBlocklist: CollectionConfig = {
  slug: 'cod-blocklist',
  admin: { useAsTitle: 'phone' },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      name: 'phone',
      type: 'text',
      unique: true,
      required: true,
      validate: (value: string | null | undefined) =>
        (typeof value === 'string' && /^[6-9][0-9]{9}$/.test(value)) || 'Use a 10-digit Indian mobile number',
    },
    { name: 'reason', type: 'text' },
  ],
}
