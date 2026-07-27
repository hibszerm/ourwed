/**
 * Deterministic Polish postal-address formatting for contracts.
 * Never blindly concatenates a full/preformatted address with postal+city again.
 */

export type PolishPostalAddressParts = {
  street?: string | null
  buildingNumber?: string | null
  apartmentNumber?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  /** Preformatted address — used when structured street is unavailable. */
  fullAddress?: string | null
}

const POSTAL_RE = /\b\d{2}-\d{3}\b/

function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function stripTrailingCountry(s: string): string {
  return s.replace(/,\s*Polska\s*$/i, '').trim()
}

function ensureUlPrefix(streetLine: string): string {
  const t = streetLine.trim()
  if (!t) return ''
  if (/^(ul\.|al\.|pl\.|os\.|przy\s+ul)/i.test(t)) return t
  return `ul. ${t}`
}

function addressAlreadyHasPostalOrCity(
  base: string,
  postalCode?: string | null,
  city?: string | null,
): boolean {
  const n = base.toLowerCase()
  const postal = postalCode?.trim()
  const cityTrim = city?.trim()
  if (postal && n.includes(postal.toLowerCase())) return true
  if (POSTAL_RE.test(base)) {
    // Some XX-XXX already present — do not append structured postal/city again
    return true
  }
  if (cityTrim && n.includes(cityTrim.toLowerCase()) && /,\s*$/.test(base) === false) {
    // City already in address and no structured street rebuild — avoid ", City, City"
    if (new RegExp(`,\\s*${cityTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(base)) {
      return true
    }
  }
  return false
}

function buildStructuredLine(parts: PolishPostalAddressParts): string | null {
  const street = parts.street?.trim()
  if (!street) return null

  const building = parts.buildingNumber?.trim()
  const apt = parts.apartmentNumber?.trim()
  let line = ensureUlPrefix(street)
  if (building) {
    line = `${line} ${building}`
    if (apt) line = `${line}/${apt}`
  }

  const postal = parts.postalCode?.trim()
  const city = parts.city?.trim()
  if (postal && city) {
    line = `${line}, ${postal} ${city}`
  } else if (postal) {
    line = `${line}, ${postal}`
  } else if (city) {
    line = `${line}, ${city}`
  }

  const country = parts.country?.trim()
  if (country && !/^polska$/i.test(country)) {
    line = `${line}, ${country}`
  }

  return collapseSpaces(line)
}

/**
 * Produce exactly one normalized Polish address string.
 * Prefer structured fields; otherwise reuse fullAddress without re-appending
 * postal code / city when they are already present.
 */
export function formatPolishPostalAddress(
  parts: PolishPostalAddressParts,
): string {
  const structured = buildStructuredLine(parts)
  if (structured) return stripTrailingCountry(structured)

  const full = stripTrailingCountry(parts.fullAddress?.trim() || '')
  if (!full) return ''

  if (
    addressAlreadyHasPostalOrCity(full, parts.postalCode, parts.city)
  ) {
    return collapseSpaces(full)
  }

  const extras: string[] = []
  const postal = parts.postalCode?.trim()
  const city = parts.city?.trim()
  if (postal && city) extras.push(`${postal} ${city}`)
  else if (postal) extras.push(postal)
  else if (city) extras.push(city)

  if (extras.length === 0) return collapseSpaces(full)
  return collapseSpaces(`${full}, ${extras.join(', ')}`)
}

/** True when an address string shows obvious postal+city duplication. */
export function hasDuplicatedPostalCity(address: string): boolean {
  const a = collapseSpaces(address)
  // Exact reported pattern: "44-100 Gliwice, 44-100, Gliwice"
  if (/\d{2}-\d{3}\s+[^,]+,\s*\d{2}-\d{3}\s*,\s*[^,]+/.test(a)) return true
  // "44-100 Gliwice, 44-100 Gliwice"
  if (/\d{2}-\d{3}\s+([^,]+),\s*\d{2}-\d{3}\s+\1/i.test(a)) return true
  return false
}
