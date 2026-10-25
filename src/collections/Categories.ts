import { APIError, type CollectionConfig } from 'payload'

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
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        const { totalDocs } = await req.payload.count({
          collection: 'products',
          where: { category: { equals: id } },
          req,
          overrideAccess: true,
        })
        if (totalDocs > 0) {
          throw new APIError(
            `This category is used by ${totalDocs} product(s). Move them to another category first.`,
            400,
          )
        }
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
