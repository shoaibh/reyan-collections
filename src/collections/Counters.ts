import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'

export const Counters: CollectionConfig = {
  slug: 'counters',
  admin: { hidden: true },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: 'key', type: 'text', unique: true, required: true },
    { name: 'lastNumber', type: 'number', required: true },
  ],
}
