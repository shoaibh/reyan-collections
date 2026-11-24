import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { safeUrl } from '../lib/validators'
import { revalidate } from '../lib/revalidate'

export const LinksPage: GlobalConfig = {
  slug: 'links-page',
  hooks: {
    afterChange: [
      ({ doc }) => {
        revalidate(['global:links-page'])
        return doc
      },
    ],
  },
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
        { name: 'url', type: 'text', required: true, validate: safeUrl },
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
