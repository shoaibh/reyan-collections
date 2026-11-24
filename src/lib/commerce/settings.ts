import type { Payload } from 'payload'

import type { CommerceSettings } from './pricing'

export async function loadCommerceSettings(
  payload: Payload,
): Promise<CommerceSettings & { whatsappNumber: string | null }> {
  const s = await payload.findGlobal({ slug: 'store-settings', depth: 0 })
  const c = s.commerce
  const t = s.timeouts
  return {
    shippingFee: c?.shippingFee ?? 49,
    freeShippingAbove: c?.freeShippingAbove ?? null,
    prepaidDiscount: c?.prepaidDiscount ?? 0,
    codMaxOrderValue: c?.codMaxOrderValue ?? 2000,
    maxPerOrder: c?.maxPerOrder ?? 5,
    pendingPaymentMinutes: t?.pendingPaymentMinutes ?? 30,
    codConfirmHours: t?.codConfirmHours ?? 24,
    whatsappNumber: s.business?.whatsappNumber ?? null,
  }
}
