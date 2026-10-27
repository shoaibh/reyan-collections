import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { slugField } from '../fields/slug'
import { revalidate } from '../lib/revalidate'

export const Curated: CollectionConfig = {
  slug: 'curated',
  labels: {
    singular: 'Collection',
    plural: 'Collections',
  },
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      ({ doc }) => {
        revalidate(['curated', 'global:navigation'])
        return doc
      },
    ],
    afterDelete: [
      ({ doc }) => {
        revalidate(['curated', 'global:navigation'])
        return doc
      },
    ],
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
      name: 'products',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
