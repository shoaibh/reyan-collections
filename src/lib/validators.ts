import type { NumberFieldValidation } from 'payload'

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
