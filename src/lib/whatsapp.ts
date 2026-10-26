export function buildWhatsAppLink(number: string, text: string): string {
  const digits = number.replace(/\D/g, '')
  const full = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}
