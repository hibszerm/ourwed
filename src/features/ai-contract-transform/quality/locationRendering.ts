/**
 * Deterministic location / customer-address rendering for transform lab.
 */

import {
  looksLikeStreetAddress,
  looksLikeVenueDisplayName,
} from '../locationInsertionPolicy'
import { sanitizeDuplicatedLocationWrappers } from './normalize'

export type LocationValue = {
  displayName?: string
  street?: string
  buildingNumber?: string
  postalCode?: string
  city?: string
  country?: string
  fullAddress?: string
}

export function locationFromDatasetEntry(loc?: {
  displayName?: string
  fullAddress?: string
  city?: string
}): LocationValue | undefined {
  if (!loc) return undefined
  return {
    displayName: loc.displayName,
    fullAddress: loc.fullAddress,
    city: loc.city,
  }
}

export function renderLocationSummary(location: LocationValue): string {
  const name = location.displayName?.trim()
  const addr = location.fullAddress?.trim()
  const city = location.city?.trim()
  if (name && looksLikeVenueDisplayName(name) && !looksLikeStreetAddress(name)) {
    if (city && !name.toLowerCase().endsWith(`, ${city.toLowerCase()}`)) {
      // Prefer "Pałac Rydzyna, Rydzyna" even when the venue name contains the city token
      if (!name.toLowerCase().includes(`, ${city.toLowerCase()}`)) {
        return `${name}, ${city}`
      }
    }
    return name
  }
  if (addr) return addr
  if (name) return name
  return ''
}

export function renderLocationAfterPreposition(
  location: LocationValue,
  _context: 'preparation' | 'ceremony' | 'reception' | 'generic',
): string {
  const name = location.displayName?.trim()
  const addr = location.fullAddress?.trim()
  if (name && looksLikeVenueDisplayName(name) && !looksLikeStreetAddress(name)) {
    // No deterministic inflection available — neutral form
    return `w obiekcie „${name}”`
  }
  if (addr && looksLikeStreetAddress(addr)) {
    return `pod adresem ${addr}`
  }
  if (addr) return `pod adresem ${addr}`
  if (name) return `w miejscu: ${name}`
  return ''
}

export function renderPreparationLocationClause(location: LocationValue): string {
  return sanitizeDuplicatedLocationWrappers(
    `Przygotowania odbędą się ${renderLocationAfterPreposition(location, 'preparation')}.`,
  )
}

export function renderCeremonyLocationClause(location: LocationValue): string {
  return sanitizeDuplicatedLocationWrappers(
    `Ceremonia odbędzie się ${renderLocationAfterPreposition(location, 'ceremony')}.`,
  )
}

export function renderReceptionLocationClause(location: LocationValue): string {
  const name = location.displayName?.trim()
  const addr = location.fullAddress?.trim()
  if (name && looksLikeVenueDisplayName(name) && !looksLikeStreetAddress(name)) {
    return sanitizeDuplicatedLocationWrappers(
      `Przyjęcie weselne odbędzie się w miejscu przyjęcia: ${renderLocationSummary(location)}.`,
    )
  }
  if (addr) {
    return sanitizeDuplicatedLocationWrappers(
      `Przyjęcie weselne odbędzie się pod adresem ${addr}.`,
    )
  }
  return sanitizeDuplicatedLocationWrappers(
    `Przyjęcie weselne odbędzie się ${renderLocationAfterPreposition(location, 'reception')}.`,
  )
}

export function renderMultiLocationSummary(input: {
  preparation?: LocationValue
  ceremony?: LocationValue
  reception?: LocationValue
}): string {
  const parts: string[] = []
  if (input.preparation) {
    parts.push(`przygotowania: ${renderLocationSummary(input.preparation)}`)
  }
  if (input.ceremony) {
    parts.push(`ceremonia: ${renderLocationSummary(input.ceremony)}`)
  }
  if (input.reception) {
    parts.push(`przyjęcie: ${renderLocationSummary(input.reception)}`)
  }
  return parts.join('; ')
}

/** Customer address for "zam. …" patterns. */
export function renderCustomerAddress(address: string): string {
  let a = address.trim().replace(/\s+/g, ' ')
  a = a.replace(/,\s*,/g, ',')
  a = a.replace(/\s*,\s*/g, ', ')
  // Strip trailing ", Polska" for domestic addresses
  a = a.replace(/,\s*Polska\s*$/i, '')
  if (/^ul\.?\s/i.test(a) || /^al\.?\s/i.test(a)) {
    return a
  }
  if (/^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(a) && !/\d{2}-\d{3}/.test(a.slice(0, 10))) {
    // Street name without ul. prefix — keep as-is if already "przy ul."
    if (!/^przy\s+ul/i.test(a)) {
      return `ul. ${a}`
    }
  }
  return a
}

export function renderCustomerAddressWithZam(address: string): string {
  const rendered = renderCustomerAddress(address)
  if (/^ul\.?\s/i.test(rendered)) return `zam. ${rendered}`
  if (/^przy\s+ul/i.test(rendered)) return `zam. ${rendered}`
  return `zam. ${rendered}`
}
