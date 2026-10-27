import type { NumberFieldValidation, TextFieldSingleValidation } from 'payload'

export const wholeNumber =
  (min: number, unit = 'rupees'): NumberFieldValidation =>
  (value, { required }) => {
    if (value === undefined || value === null) {
      return required ? 'This field is required.' : true
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return `Must be a whole number of ${unit}`
    }
    if (value < min) return `Must be at least ${min}`
    return true
  }

const SAFE_URL_MESSAGE = 'Use an https:// link or a site path like /shop'

/** Admin-entered links: only https URLs or site paths (a single leading slash). */
export const safeUrl: TextFieldSingleValidation = (value, { required }) => {
  if (value === undefined || value === null || value === '') {
    return required ? 'This field is required.' : true
  }
  if (typeof value !== 'string') return SAFE_URL_MESSAGE
  if (value.startsWith('/')) return value.startsWith('//') ? SAFE_URL_MESSAGE : true
  try {
    return new URL(value).protocol === 'https:' ? true : SAFE_URL_MESSAGE
  } catch {
    return SAFE_URL_MESSAGE
  }
}
