import { formatINR } from '@/lib/format'
import type { PricedLine } from '@/lib/commerce/pricing'

export type CodResult = { eligible: true } | { eligible: false; reason: string }

export function codEligibility(input: {
  lines: Pick<PricedLine, 'title' | 'codAllowed'>[]
  total: number
  codMaxOrderValue: number
  blocked: boolean
  codServiceable: boolean | null
}): CodResult {
  const no = (reason: string): CodResult => ({ eligible: false, reason })
  const item = input.lines.find((l) => !l.codAllowed)
  if (item) return no(`Cash on delivery isn't available for ${item.title}`)
  if (input.total > input.codMaxOrderValue) {
    return no(`Cash on delivery is available on orders up to ${formatINR(input.codMaxOrderValue)}`)
  }
  if (input.blocked) return no("Cash on delivery isn't available for this order. Please pay online.")
  if (input.codServiceable === null) return no('Enter your pincode to check cash on delivery')
  if (input.codServiceable === false) return no("Cash on delivery isn't available for this pincode")
  return { eligible: true }
}
