/**
 * Fact-surface ownership for contract blocks.
 *
 * Categories may coexist in one paragraph (MIXED). Ownership is driven by
 * structural party-clause markers and exact provider identity values — not a
 * giant Polish vocabulary blacklist.
 */

import type { TransformDocumentBlock } from '../types'

export type FactOwner = 'CUSTOMER' | 'PROVIDER' | 'MIXED' | 'EVENT' | 'COMMERCIAL' | 'LEGAL' | 'UNKNOWN'

const PROVIDER_ROLE_CLOSE =
  /zwan[a-ząćęłńóśźż]*\s+dalej\s+[„"]?(Fotograf|Wykonawc|Usługodawc|Filmowc|Kamerzyst)[a-ząćęłńóśźż]*/i

const CUSTOMER_ROLE_CLOSE =
  /zwan[a-ząćęłńóśźż]*\s+dalej\s+[„"]?(Zamawiając|Klient|Parą\s+Młod)[a-ząćęłńóśźż]*/i

const CUSTOMER_PARTY_MARKERS =
  /Klientami\s+są|Klientem\s+jest|Klient:\s|Zamawiający:\s|Zamawiając[a-ząćęłńóśźż]*\s+są|,\s*zam\./i

const PROVIDER_IDENTITY_MARKERS =
  /\b(NIP|REGON)\b|prowadząc[a-ząćęłńóśźż]*\s+działalność|pod\s+firmą/i

/** Signature / closing labels are not contracting-party identity clauses. */
export function isSignatureOrClosingLabel(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/data i czytelny podpis|—\s*data i czytelny|podpis\s*$/i.test(t)) return true
  if (/^(Klient\w*|Fotograf\w*|Wykonawc\w*|Usługodawc\w*|Realizatork\w*|Para)\s*[—–-]/i.test(t)) {
    return true
  }
  return false
}

export function hasProviderIdentityMarkers(text: string): boolean {
  return PROVIDER_IDENTITY_MARKERS.test(text) || PROVIDER_ROLE_CLOSE.test(text)
}

export function hasCustomerPartyMarkers(text: string): boolean {
  return CUSTOMER_ROLE_CLOSE.test(text) || CUSTOMER_PARTY_MARKERS.test(text)
}

/**
 * Classify block-level ownership. MIXED = provider + customer in same text.
 */
export function classifyFactOwner(text: string): FactOwner {
  const t = text.trim()
  if (!t) return 'UNKNOWN'
  if (isSignatureOrClosingLabel(t)) return 'LEGAL'
  const provider = hasProviderIdentityMarkers(t)
  const customer = hasCustomerPartyMarkers(t)
  if (provider && customer) return 'MIXED'
  if (provider) return 'PROVIDER'
  if (customer) return 'CUSTOMER'
  if (/przygotowa|ceremoni|przyjęc|wesel/i.test(t) && /ul\.|pl\.|Hotel|Kości/i.test(t)) {
    return 'EVENT'
  }
  if (/\d[\d\s]*\s*zł|słownie:|wynagrodzen|zadatek|zaliczk|rezerwacyjn/i.test(t)) {
    return 'COMMERCIAL'
  }
  return 'UNKNOWN'
}

/**
 * Split a MIXED "pomiędzy Provider…, a Customer…" opening clause.
 * Returns null when structure is not confidently mixed.
 */
export function splitMixedPartyClause(text: string): {
  providerHalf: string
  separator: string
  customerHalf: string
} | null {
  const m = text.match(
    /^(.*?zwan[a-ząćęłńóśźż]*\s+dalej\s+[„"]?(?:Fotograf|Wykonawc|Usługodawc|Filmowc|Kamerzyst)[a-ząćęłńóśźż]*)(,\s*a\s+)(.+)$/is,
  )
  if (!m) return null
  const providerHalf = m[1]!.trimEnd()
  const separator = m[2]!
  const customerHalf = m[3]!.trim()
  if (!hasCustomerPartyMarkers(customerHalf) && !/zamieszkał|zam\.\s|PESEL/i.test(customerHalf)) {
    return null
  }
  return { providerHalf, separator, customerHalf }
}

/** Extract residential address surface from party prose (not venue). */
export function extractCustomerAddressSurface(text: string): string | null {
  // Abbreviation: zam. ul. …
  const abbreviated = text.match(
    /zam\.\s*((?:ul\.|al\.|os\.|pl\.)[^,]+(?:,\s*\d{2}-\d{3}\s+[^,]+)?)/i,
  )
  if (abbreviated?.[1]) return abbreviated[1].trim().replace(/[.,;]+$/, '')

  // Full: zamieszkałą/zamieszkały przy ul. …
  // JS \w does not match Polish diacritics — use explicit class.
  const full = text.match(
    /zamieszkał[a-ząćęłńóśźż]*(?:\s+przy)?\s+((?:ul\.|al\.|os\.|pl\.)[^,]+(?:,\s*\d{2}-\d{3}\s+[^,]+)?)/i,
  )
  if (full?.[1]) return full[1].trim().replace(/[.,;]+$/, '')

  // Form / table: Adres: …
  const labeled = text.match(
    /Adres\s*:\s*((?:ul\.|al\.|os\.|pl\.)[^,\n]+(?:,\s*\d{2}-\d{3}\s+[^,\n]+)?)/i,
  )
  if (labeled?.[1]) return labeled[1].trim().replace(/[.,;]+$/, '')

  return null
}

export function blockFactOwner(block: TransformDocumentBlock): FactOwner {
  const family = block.tableContext?.ownershipFamily
  if (family === 'customer') return 'CUSTOMER'
  if (family === 'provider') return 'PROVIDER'
  if (family === 'wedding_location' || family === 'wedding_date') return 'EVENT'
  if (family === 'service_scope') return 'COMMERCIAL'
  return classifyFactOwner(block.text ?? '')
}
