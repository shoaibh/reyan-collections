import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'
import { publishedOrAdmin } from '../access/publishedOrAdmin'
import { slugField } from '../fields/slug'
import { revalidate } from '../lib/revalidate'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
  },
  versions: {
    drafts: true,
  },
  access: {
    read: publishedOrAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      ({ doc, previousDoc }) => {
        const tags = ['pages', 'global:navigation']
        if (doc?.slug) tags.push(`page:${doc.slug}`)
        if (previousDoc?.slug && previousDoc.slug !== doc?.slug) tags.push(`page:${previousDoc.slug}`)
        revalidate(tags)
        return doc
      },
    ],
    afterDelete: [
      ({ doc }) => {
        revalidate(['pages', 'global:navigation', ...(doc?.slug ? [`page:${doc.slug}`] : [])])
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
      name: 'content',
      type: 'richText',
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        {
          name: 'title',
          type: 'text',
        },
        {
          name: 'description',
          type: 'textarea',
        },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
        },
      ],
    },
  ],
}
