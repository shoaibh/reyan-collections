export function showComparison(p: {
  price: number
  compareAt?: { price?: number | null } | null
}): boolean {
  const compare = p.compareAt?.price
  return typeof compare === 'number' && compare > p.price
}

export function isComparisonStale(checkedOn: string | Date, now: Date, days = 30): boolean {
  const checked = new Date(checkedOn).getTime()
  return now.getTime() - checked > days * 24 * 60 * 60 * 1000
}
