import type { AddressFieldValue } from '@/features/forms/AddressField'
import { mergeContractAddressForStorage } from '@/features/weddings/contractAddressFromField'
import type { CreateFullWeddingInput } from '@/features/weddings/createFullWedding'
import type { CreateWeddingInput } from '@/types/wedding'

export type NewWeddingSelectedExtra = {
  extraServiceId: string
  name: string
  priceSnapshot: number
}

export type NewWeddingFullFormSource = {
  partner1: string
  partner2: string
  date: string
  partner1Phone: string
  partner2Phone: string
  email: string
  contractAddress?: AddressFieldValue
  partner1PostalCode: string
  partner1City: string
  packageId: string
  packageName: string
  price: number
  depositPaid: boolean
  depositAmount?: number
  depositAmountCatalog?: number
  depositPaymentDate?: string
  currency?: string
  accentColor?: string
  notes?: string
  extras: NewWeddingSelectedExtra[]
  bridePreparation?: AddressFieldValue
  groomPreparation?: AddressFieldValue
  ceremony?: AddressFieldValue
  reception?: AddressFieldValue
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function optionalLocation(value: AddressFieldValue | undefined): unknown {
  if (value == null) return undefined
  if (typeof value === 'string') return optionalText(value)
  const formatted = value.formattedAddress?.trim()
  const name = value.name?.trim()
  if (!formatted && !name && !value.placeId) return undefined
  return value
}

/**
 * Maps Full Create form state to createFullWedding.
 * Does not emit ceremony/reception scalars — places go to wedding_places.
 */
export function buildFullWeddingCreateInput(
  data: NewWeddingFullFormSource,
  options: { priceIsDirty: boolean },
): CreateFullWeddingInput {
  const contract = mergeContractAddressForStorage(
    data.contractAddress,
    data.partner1PostalCode,
    data.partner1City,
  )
  const wedding: CreateWeddingInput = {
    partner1: data.partner1.trim(),
    partner2: data.partner2.trim(),
    date: data.date,
    phone: optionalText(data.partner1Phone),
    partner2Phone: optionalText(data.partner2Phone),
    email: optionalText(data.email),
    partner1Address: contract.partner1Address,
    partner1PostalCode: contract.partner1PostalCode,
    partner1City: contract.partner1City,
    packageId: data.packageId || null,
    packageName: data.packageName,
    price: data.price,
    depositPaid: data.depositPaid,
    depositAmount: data.depositAmount ?? data.depositAmountCatalog,
    depositPaymentDate: data.depositPaymentDate,
    currency: data.currency,
    accentColor: data.accentColor,
    notes: optionalText(data.notes),
    creationOptions: options.priceIsDirty
      ? { preserveImportedPrice: true }
      : undefined,
  }

  return {
    wedding,
    places: {
      bridePreparation: optionalLocation(data.bridePreparation),
      groomPreparation: optionalLocation(data.groomPreparation),
      ceremony: optionalLocation(data.ceremony),
      reception: optionalLocation(data.reception),
    },
    extras: data.extras.map((extra) => ({
      extraServiceId: extra.extraServiceId,
      priceSnapshot: extra.priceSnapshot,
      quantity: 1,
      nameSnapshot: extra.name,
    })),
    explicitPackagePrice: data.price,
  }
}
