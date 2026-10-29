export type IntegrationName = 'RAZORPAY' | 'TURNSTILE' | 'SHIPROCKET'

/**
 * Whether an integration runs against the real service or the mock. Fails closed: the mocks use
 * public secrets, so production must choose explicitly rather than default to mock.
 */
export function integrationMode(name: IntegrationName): 'mock' | 'live' {
  const value = process.env[`${name}_MODE`]
  if (value === 'live') return 'live'
  if (value === 'mock') return 'mock'
  if (value === undefined || value === '') {
    if (process.env.NODE_ENV === 'production') throw new Error(`Set ${name}_MODE to live or mock`)
    return 'mock'
  }
  throw new Error(`${name}_MODE must be live or mock`)
}
