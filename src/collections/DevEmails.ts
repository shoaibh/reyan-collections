import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'

/** Dev inbox for the mock email adapter. Written via the local API only (create is closed). */
export const DevEmails: CollectionConfig = {
  slug: 'dev-emails',
  admin: { group: 'Dev', useAsTitle: 'subject', defaultColumns: ['subject', 'to', 'createdAt'] },
  access: { read: isAdmin, create: () => false, update: () => false, delete: isAdmin },
  fields: [
    { name: 'to', type: 'text', required: true },
    { name: 'subject', type: 'text', required: true },
    { name: 'html', type: 'textarea', required: true },
    { name: 'tag', type: 'text' },
    { name: 'orderNumber', type: 'text', index: true },
  ],
}
