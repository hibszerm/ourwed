/**
 * Location replacement capability from wedding generation input.
 */

import type { ContractFieldKey, ContractGenerationInput, LocationReplacementCapability } from './types'

export function deriveLocationReplacementCapability(
  generationInput: ContractGenerationInput,
  fieldKey: ContractFieldKey,
): LocationReplacementCapability {
  const full =
    fieldKey === 'reception_location'
      ? generationInput.locations.reception
      : fieldKey === 'ceremony_location'
        ? generationInput.locations.ceremony
        : fieldKey === 'preparation_location'
          ? generationInput.locations.preparation
          : undefined

  return {
    fullLocationValue: full,
    venueName: undefined,
    address: full,
  }
}

export function postalCodeCityCommaWarning(address: string | undefined): string | null {
  if (!address) return null
  if (/\d{2}-\d{3},\s*\S/.test(address)) {
    return 'Adres w danych ślubu zawiera przecinek między kodem pocztowym a miastem.'
  }
  return null
}
