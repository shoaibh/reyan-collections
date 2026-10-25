import type { Field } from 'payload'

const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

const randomSuffix = (length: number): string =>
  Array.from({ length }, () => SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)]).join('')

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || `item-${randomSuffix(6)}`
}

export function slugField(source = 'title'): Field {
  return {
    name: 'slug',
    type: 'text',
    unique: true,
    index: true,
    admin: {
      position: 'sidebar',
    },
    hooks: {
      beforeValidate: [
        ({ value, data }) => {
          if (typeof value === 'string' && value.trim() !== '') return value
          const sourceValue = data?.[source]
          return slugify(typeof sourceValue === 'string' ? sourceValue : '')
        },
      ],
    },
  }
}
