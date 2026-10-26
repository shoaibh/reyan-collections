import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 600_000,
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      options: ['owner'],
      defaultValue: 'owner',
      required: true,
    },
  ],
}
