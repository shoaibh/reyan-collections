import type { GlobalConfig, RelationshipFieldValidation } from 'payload'

import { isAdmin } from '../access/isAdmin'

const requiredForType =
  (linkType: string, label: string): RelationshipFieldValidation =>
  (value, { siblingData }) => {
    const chosen = (siblingData as { linkType?: string } | undefined)?.linkType === linkType
    if (chosen && (value === undefined || value === null || value === '')) {
      return `${label} is required for this link type`
    }
    return true
  }

const showFor = (linkType: string) => (_data: unknown, siblingData: unknown) =>
  (siblingData as { linkType?: string } | undefined)?.linkType === linkType

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Navigation',
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'items',
      type: 'array',
      maxRows: 4,
      fields: [
        { name: 'label', type: 'text', required: true },
        {
          name: 'linkType',
          type: 'select',
          required: true,
          options: [
            { label: 'Category', value: 'category' },
            { label: 'Collection', value: 'collection' },
            { label: 'Page', value: 'page' },
            { label: 'Shop', value: 'shop' },
          ],
        },
        {
          name: 'category',
          type: 'relationship',
          relationTo: 'categories',
          admin: { condition: showFor('category') },
          validate: requiredForType('category', 'Category'),
        },
        {
          name: 'collection',
          type: 'relationship',
          relationTo: 'curated',
          admin: { condition: showFor('collection') },
          validate: requiredForType('collection', 'Collection'),
        },
        {
          name: 'page',
          type: 'relationship',
          relationTo: 'pages',
          admin: { condition: showFor('page') },
          validate: requiredForType('page', 'Page'),
        },
      ],
    },
  ],
}
