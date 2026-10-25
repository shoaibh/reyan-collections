import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { slugField } from '../fields/slug'

export const Categories: CollectionConfig = {
  slug: 'categories',
  defaultSort: 'order',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField(),
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'tileColor',
      type: 'select',
      required: true,
      defaultValue: 'cobalt',
      options: ['cobalt', 'mint', 'tomato', 'sun', 'pink'],
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
