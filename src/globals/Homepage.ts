import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/isAdmin'

const cta = (name: string) => ({
  name,
  type: 'group' as const,
  fields: [
    { name: 'label', type: 'text' as const },
    { name: 'link', type: 'text' as const },
  ],
})

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  label: 'Homepage',
  access: {
    read: () => true,
    update: isAdmin,
  },
  versions: { drafts: true },
  fields: [
    {
      name: 'announcement',
      type: 'array',
      maxRows: 3,
      fields: [{ name: 'text', type: 'text', required: true }],
    },
    {
      name: 'hero',
      type: 'group',
      fields: [
        { name: 'pill', type: 'text' },
        { name: 'headline', type: 'text', required: true },
        { name: 'highlightWord', type: 'text' },
        { name: 'subtext', type: 'textarea' },
        cta('ctaPrimary'),
        cta('ctaSecondary'),
        { name: 'productA', type: 'relationship', relationTo: 'products' },
        { name: 'productB', type: 'relationship', relationTo: 'products' },
        { name: 'imageOverrideA', type: 'upload', relationTo: 'media' },
        { name: 'imageOverrideB', type: 'upload', relationTo: 'media' },
        { name: 'stickerText', type: 'text' },
      ],
    },
    { name: 'favouritesCollection', type: 'relationship', relationTo: 'curated' },
  ],
}
