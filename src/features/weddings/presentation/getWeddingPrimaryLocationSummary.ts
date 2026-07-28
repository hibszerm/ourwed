/**
 * Compact Wedding primary location for list cards, dashboard, detail header.
 * Prefers reception venue name + locality — never a full street address.
 */

import {
  adaptLegacyWeddingLocationFields,
  isMeaningfulVenueName,
} from '@/features/travel/weddingLocationModel'
import type { WeddingPlace } from '@/types/travel'
import type {
  Wedding,
  WeddingPrimaryLocationSource,
  WeddingPrimaryLocationSummary,
} from '@/types/wedding'

export type {
  WeddingPrimaryLocationSource,
  WeddingPrimaryLocationSummary,
} from '@/types/wedding'

export interface LocationLocalityInput {
  /** Structured city / locality when known. */
  city?: string | null
  postalCode?: string | null
  formattedAddress?: string | null
  addressLine?: string | null
  country?: string | null
  region?: string | null
}

const COUNTRY_LIKE = new Set([
  'polska',
  'poland',
  'pl',
  'deutschland',
  'germany',
  'de',
  'czechy',
  'czech republic',
  'czechia',
  'cz',
  'slowacja',
  'slovakia',
  'sk',
  'litwa',
  'lithuania',
  'lt',
  'ukraina',
  'ukraine',
  'ua',
  'austria',
  'at',
  'france',
  'francja',
  'fr',
  'italy',
  'wlochy',
  'włochy',
  'it',
  'spain',
  'hiszpania',
  'es',
  'united kingdom',
  'uk',
  'usa',
  'united states',
])

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeStreetSegment(segment: string): boolean {
  const s = segment.trim()
  if (!s) return false
  // "Lwowska 78", "ul. Szpitalna 12", "al. Niepodległości 15"
  if (/^(ul\.?|al\.?|pl\.?|os\.?|osiedle)\s+/i.test(s)) return true
  if (/\d/.test(s) && /[a-ząćęłńóśźż]/i.test(s) && !/^\d{2}-\d{3}\b/.test(s)) {
    return true
  }
  return false
}

/**
 * Extract human-readable locality (town/city) without street, postal, or country.
 */
export function getLocationLocality(
  location: LocationLocalityInput | null | undefined,
): string | null {
  if (!location) return null

  const structuredCity = location.city?.trim()
  if (structuredCity && !COUNTRY_LIKE.has(normalizeToken(structuredCity))) {
    return structuredCity
  }

  const formatted =
    location.formattedAddress?.trim() ||
    location.addressLine?.trim() ||
    ''
  if (!formatted) return null

  const parts = formatted
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  // "34-144 Izdebnik" or postal + city in one segment
  for (const part of parts) {
    const withPostal = part.match(/^(\d{2}-\d{3})\s+(.+)$/)
    if (withPostal?.[2]?.trim()) {
      const city = withPostal[2].trim()
      if (!COUNTRY_LIKE.has(normalizeToken(city))) return city
    }
  }

  // Walk from the end: skip country / bare postal / street
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    const token = normalizeToken(part)
    if (COUNTRY_LIKE.has(token)) continue
    if (/^\d{2}-\d{3}$/.test(part)) continue
    if (looksLikeStreetSegment(part)) continue
    if (location.region && normalizeToken(location.region) === token) {
      // Prefer earlier city-like segment over province when both exist
      continue
    }
    // Skip first segment when multiple parts — usually the street line
    if (i === 0 && parts.length > 1) continue
    return part
  }

  return null
}

function placeCandidate(place: WeddingPlace | undefined): {
  venueName: string | null
  locality: string | null
  hasData: boolean
} | null {
  if (!place) return null
  const adapted = adaptLegacyWeddingLocationFields(place)
  const venueName = adapted.name
  const locality = getLocationLocality({
    formattedAddress: adapted.formattedAddress,
  })
  const hasData = Boolean(venueName || locality || adapted.formattedAddress)
  if (!hasData) return null
  return { venueName, locality, hasData }
}

function scalarCandidate(
  text: string | null | undefined,
): { venueName: string | null; locality: string | null; hasData: boolean } | null {
  const raw = text?.trim()
  if (!raw) return null
  // Scalar may be a full address or a venue name.
  if (isMeaningfulVenueName(raw, raw) && !raw.includes(',')) {
    return { venueName: raw, locality: null, hasData: true }
  }
  const adapted = adaptLegacyWeddingLocationFields({
    label: null,
    formattedAddress: raw,
  })
  // If the whole string looks like a venue without address commas, treat as name
  if (
    isMeaningfulVenueName(raw, null) &&
    !/\d{2}-\d{3}/.test(raw) &&
    !looksLikeStreetSegment(raw.split(',')[0] ?? raw)
  ) {
    const locality = getLocationLocality({ formattedAddress: raw })
    // "Villa Love, Izdebnik" style free text
    if (raw.includes(',') && locality) {
      const maybeName = raw.split(',')[0]?.trim() || null
      if (maybeName && isMeaningfulVenueName(maybeName, raw)) {
        return {
          venueName: maybeName,
          locality:
            normalizeToken(maybeName) === normalizeToken(locality)
              ? null
              : locality,
          hasData: true,
        }
      }
    }
    if (!raw.includes(',')) {
      return { venueName: raw, locality: null, hasData: true }
    }
  }
  const locality = getLocationLocality({
    formattedAddress: adapted.formattedAddress || raw,
  })
  return {
    venueName: null,
    locality,
    hasData: Boolean(locality || adapted.formattedAddress || raw),
  }
}

function formatCompact(
  venueName: string | null,
  locality: string | null,
): string | null {
  const name = venueName?.trim() || null
  const city = locality?.trim() || null
  if (name && city) {
    if (normalizeToken(name) === normalizeToken(city)) return name
    return `${name}, ${city}`
  }
  if (name) return name
  if (city) return city
  return null
}

function fromCandidate(
  candidate: {
    venueName: string | null
    locality: string | null
  },
  source: WeddingPrimaryLocationSource,
): WeddingPrimaryLocationSummary {
  return {
    venueName: candidate.venueName,
    locality: candidate.locality,
    displayText: formatCompact(candidate.venueName, candidate.locality),
    source,
  }
}

const EMPTY: WeddingPrimaryLocationSummary = {
  venueName: null,
  locality: null,
  displayText: null,
  source: 'none',
}

/**
 * Shared compact location for Wedding cards, dashboard, and detail header.
 * Priority: reception → ceremony → preparation → legacy scalars.
 */
export function getWeddingPrimaryLocationSummary(
  wedding: Wedding,
  places?: WeddingPlace[] | null,
): WeddingPrimaryLocationSummary {
  // Prefer precomputed hydrate projection when places are not explicitly passed
  // (list / dashboard). Detail pages pass places for the freshest view.
  if (
    (!places || places.length === 0) &&
    wedding.primaryLocation &&
    wedding.primaryLocation.source !== 'none'
  ) {
    return wedding.primaryLocation
  }

  const byRole = new Map((places ?? []).map((p) => [p.role, p]))

  const reception = placeCandidate(byRole.get('reception'))
  if (reception?.venueName || reception?.locality) {
    return fromCandidate(reception, 'reception')
  }
  // Reception exists as address-only with locality
  if (reception?.hasData && reception.locality) {
    return fromCandidate(reception, 'reception')
  }

  const receptionScalar = scalarCandidate(wedding.receptionLocation)
  if (receptionScalar?.venueName || receptionScalar?.locality) {
    return fromCandidate(receptionScalar, 'reception')
  }

  const ceremony = placeCandidate(byRole.get('ceremony'))
  if (ceremony?.venueName || ceremony?.locality) {
    return fromCandidate(ceremony, 'ceremony')
  }

  const ceremonyScalar = scalarCandidate(wedding.ceremonyLocation)
  if (ceremonyScalar?.venueName || ceremonyScalar?.locality) {
    return fromCandidate(ceremonyScalar, 'ceremony')
  }

  const prep =
    placeCandidate(byRole.get('bride_preparation')) ||
    placeCandidate(byRole.get('groom_preparation')) ||
    placeCandidate(byRole.get('preparation'))
  if (prep?.venueName || prep?.locality) {
    return fromCandidate(prep, 'preparation')
  }

  const prepScalar =
    scalarCandidate(wedding.bridePreparationLocation) ||
    scalarCandidate(wedding.groomPreparationLocation) ||
    scalarCandidate(wedding.preparationLocation)
  if (prepScalar?.venueName || prepScalar?.locality) {
    return fromCandidate(prepScalar, 'preparation')
  }

  const legacyVenue = wedding.couple?.venue?.trim() || null
  const legacyCity = wedding.couple?.city?.trim() || null
  if (legacyVenue || legacyCity) {
    const venueName =
      legacyVenue && isMeaningfulVenueName(legacyVenue, legacyCity)
        ? legacyVenue
        : null
    const locality =
      legacyCity ||
      (legacyVenue && !venueName
        ? getLocationLocality({ formattedAddress: legacyVenue })
        : null)
    const summary = fromCandidate(
      { venueName, locality },
      'legacy',
    )
    if (summary.displayText) return summary
  }

  // Last resort: reception/ceremony full scalar yielded locality-only above;
  // if we only had raw address with extractable locality already handled.
  return EMPTY
}

/** Build a hydrate projection from place rows for list/dashboard cards. */
export function buildWeddingPrimaryLocationFromPlaces(
  wedding: Wedding,
  places: WeddingPlace[],
): WeddingPrimaryLocationSummary {
  return getWeddingPrimaryLocationSummary(wedding, places)
}
