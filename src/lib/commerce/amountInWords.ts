const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

// 1..99
const belowHundred = (n: number): string =>
  n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`

// 1..999
const belowThousand = (n: number): string => {
  const h = Math.floor(n / 100)
  const rest = n % 100
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ')
}

/** Whole rupees in the Indian system (crore, lakh, thousand), e.g. "Rupees One Lakh Only". */
export function amountInWords(rupees: number): string {
  let n = Math.floor(rupees)
  if (n <= 0) return 'Rupees Zero Only'
  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  n %= 10000000
  if (crore) parts.push(`${amountCore(crore)} Crore`)
  const lakh = Math.floor(n / 100000)
  n %= 100000
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  const thousand = Math.floor(n / 1000)
  n %= 1000
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (n) parts.push(belowThousand(n))
  return `Rupees ${parts.join(' ')} Only`
}

// Crores can themselves exceed 99 (e.g. 100 crore), so spell them with the full grouping below a crore.
function amountCore(n: number): string {
  return n < 100 ? belowHundred(n) : belowThousand(n)
}
