/**
 * Map AddressField (wedding-place UX) onto wedding-domain contract party columns.
 * Does not write wedding_places and does not require GeoPlace metadata.
 */

import type { AddressFieldValue } from '@/features/forms/AddressField'
import { formatPolishPostalAddress } from '@/lib/utils/formatPolishPostalAddress'
import type { NormalizedAddress } from '@/services/addressAutocompleteProvider'

export type ContractPartyAddressFields = {
  partner1Address?: string
  partner1PostalCode?: string
  partner1City?: string
}

function isNormalizedAddress(
  value: AddressFieldValue,
): value is NormalizedAddress {
  return typeof value === 'object' && value != null && 'formattedAddress' in value
}

/** Street/building line only — postal/city stay on their own columns. */
export function contractStreetLine(value: AddressFieldValue): string {
  if (typeof value === 'string') return value.trim()
  const street = value.street?.trim()
  if (street) {
    const building = value.buildingNumber?.trim()
    const apt = value.apartmentNumber?.trim()
    if (building && apt) return `${street} ${building}/${apt}`
    if (building) return `${street} ${building}`
    return street
  }
  return (value.formattedAddress || value.name || '').trim()
}

export function splitContractAddressField(
  value: AddressFieldValue | undefined,
): ContractPartyAddressFields {
  if (value == null) return {}
  if (typeof value === 'string') {
    const address = value.trim()
    return address ? { partner1Address: address } : {}
  }
  if (!isNormalizedAddress(value)) return {}

  const address = contractStreetLine(value)
  const postal = value.postalCode?.trim()
  const city = value.city?.trim()
  return {
    ...(address ? { partner1Address: address } : {}),
    ...(postal ? { partner1PostalCode: postal } : {}),
    ...(city ? { partner1City: city } : {}),
  }
}

export function hasStructuredPostalCity(
  value: AddressFieldValue | undefined,
): boolean {
  const split = splitContractAddressField(value)
  return Boolean(split.partner1PostalCode && split.partner1City)
}

export function mergeContractAddressForStorage(
  value: AddressFieldValue | undefined,
  fallbackPostal?: string,
  fallbackCity?: string,
): ContractPartyAddressFields {
  const split = splitContractAddressField(value)
  const postal = split.partner1PostalCode || fallbackPostal?.trim() || undefined
  const city = split.partner1City || fallbackCity?.trim() || undefined
  return {
    ...(split.partner1Address ? { partner1Address: split.partner1Address } : {}),
    ...(postal ? { partner1PostalCode: postal } : {}),
    ...(city ? { partner1City: city } : {}),
  }
}

/** Editorial Step 4 line — no placeId, coordinates, or provider metadata. */
export function formatContractAddressEditorial(
  value: AddressFieldValue | undefined,
  postalCode?: string,
  city?: string,
): string {
  const merged = mergeContractAddressForStorage(value, postalCode, city)
  return formatPolishPostalAddress({
    fullAddress: merged.partner1Address,
    postalCode: merged.partner1PostalCode,
    city: merged.partner1City,
  })
}
