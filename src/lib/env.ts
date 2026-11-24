export type Env = Record<string, string | undefined>

const LIVE_KEYS: Record<string, string[]> = {
  RAZORPAY: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
  TURNSTILE: ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'],
  SHIPROCKET: ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD', 'SHIPROCKET_WEBHOOK_TOKEN'],
  EMAIL: ['RESEND_API_KEY', 'EMAIL_FROM'],
}

export const R2_KEYS = ['R2_BUCKET', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL']

/**
 * Everything wrong with the production env, one line per problem, each naming the variable. Never
 * includes a value, so the message is safe to log.
 */
export function productionEnvProblems(env: Env): string[] {
  const problems: string[] = []
  const missing = (name: string) => !env[name]

  if (missing('DATABASE_URI')) problems.push('DATABASE_URI is not set')
  if ((env.PAYLOAD_SECRET ?? '').length < 32) problems.push('PAYLOAD_SECRET must be at least 32 characters')
  if (!env.NEXT_PUBLIC_SERVER_URL?.startsWith('https://')) problems.push('NEXT_PUBLIC_SERVER_URL must start with https://')
  if ((env.ORIGIN_SECRET ?? '').length < 32) problems.push('ORIGIN_SECRET must be at least 32 characters')

  if (env.MEDIA_STORAGE === 'r2') {
    for (const name of R2_KEYS) if (missing(name)) problems.push(`${name} is not set (MEDIA_STORAGE=r2)`)
    if (env.R2_PUBLIC_URL && !env.R2_PUBLIC_URL.startsWith('https://')) problems.push('R2_PUBLIC_URL must start with https://')
  } else if (env.MEDIA_STORAGE !== 'local') {
    problems.push('MEDIA_STORAGE must be r2 or local')
  }

  for (const [integration, keys] of Object.entries(LIVE_KEYS)) {
    const mode = env[`${integration}_MODE`]
    if (mode === 'live') {
      for (const name of keys) if (missing(name)) problems.push(`${name} is not set (${integration}_MODE=live)`)
    } else if (mode !== 'mock') {
      problems.push(`${integration}_MODE must be live or mock`)
    }
  }

  return problems
}

/** Stops the boot with every problem listed, so one deploy shows the whole fix. */
export function assertProductionEnv(env: Env = process.env): void {
  const problems = productionEnvProblems(env)
  if (problems.length) throw new Error(`Production config is incomplete:\n- ${problems.join('\n- ')}`)
}
