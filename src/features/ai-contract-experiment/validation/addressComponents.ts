/**
 * Address component validation — flexible formats, no rigid comma rules.
 */

export type AddressComponents = {
  hasStreetOrLocality: boolean
  hasBuildingNumber: boolean
  hasPostalCode: boolean
  hasCity: boolean
}

const POSTAL = /\b\d{2}-\d{3}\b/
const STREET_HINT = /\b(ul\.?|al\.?|os\.?|pl\.?|avenue|street)\b/i
const NUMBER_HINT = /\b\d{1,4}(?:\/\d{1,4})?\b/

export function extractAddressComponents(address: string): AddressComponents {
  const text = address.trim()
  return {
    hasStreetOrLocality: STREET_HINT.test(text) || /[A-Za-zÀ-ž]{3,}/.test(text),
    hasBuildingNumber: NUMBER_HINT.test(text),
    hasPostalCode: POSTAL.test(text),
    hasCity: /[A-Za-zÀ-žąćęłńóśźżĄĆĘŁŃÓŚŹŻ]{3,}/.test(text),
  }
}

export function isPlausibleAddressSource(source: string): boolean {
  const c = extractAddressComponents(source)
  return c.hasStreetOrLocality && (c.hasBuildingNumber || c.hasCity)
}

/** Source without postal code is valid when other components present. */
export function addressSourceValid(source: string): boolean {
  return isPlausibleAddressSource(source)
}
