import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'

export const RateLimits: CollectionConfig = {
  slug: 'rate-limits',
  admin: { hidden: true },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [{ name: 'key', type: 'text', required: true, index: true }],
}
