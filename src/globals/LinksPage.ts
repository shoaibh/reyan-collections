import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'

export const LinksPage: GlobalConfig = {
  slug: 'links-page',
  label: 'Links Page',
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    { name: 'tagline', type: 'text' },
    {
      name: 'buttons',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'url', type: 'text', required: true },
        {
          name: 'iconType',
          type: 'select',
          defaultValue: 'link',
          options: ['shop', 'whatsapp', 'amazon', 'flipkart', 'meesho', 'instagram', 'link'],
        },
        { name: 'highlight', type: 'checkbox' },
        { name: 'enabled', type: 'checkbox', defaultValue: true },
      ],
    },
  ],
}
