import type { CreateWeddingInput } from '@/types/wedding'

export type NewWeddingFormCreateSource = {
  partner1: string
  partner2: string
  date: string
  completeLater: boolean
  packageId: string
  packageName: string
  price: number
  depositPaid: boolean
  depositAmount?: number
  depositAmountCatalog?: number
  depositPaymentDate?: string
  currency?: string
  accentColor?: string
  ceremonyLocation?: string
  receptionLocation?: string
  notes?: string
}

/**
 * Maps New Wedding form values to the create mutation.
 * Quick-create ignores (does not leak) stale package / deposit / location / notes.
 */
export function buildNewWeddingCreatePayload(
  data: NewWeddingFormCreateSource,
): CreateWeddingInput {
  const partner1 = data.partner1.trim()
  const partner2 = data.partner2.trim()
  const date = data.date

  if (data.completeLater) {
    return {
      partner1,
      partner2,
      date,
      packageId: null,
      packageName: '',
      price: 0,
      depositPaid: false,
    }
  }

  return {
    partner1,
    partner2,
    date,
    packageId: data.packageId || null,
    packageName: data.packageName,
    price: data.price,
    depositPaid: data.depositPaid,
    depositAmount: data.depositAmount ?? data.depositAmountCatalog,
    depositPaymentDate: data.depositPaymentDate,
    currency: data.currency,
    accentColor: data.accentColor,
    ceremonyLocation: data.ceremonyLocation,
    receptionLocation: data.receptionLocation,
    notes: data.notes,
  }
}
