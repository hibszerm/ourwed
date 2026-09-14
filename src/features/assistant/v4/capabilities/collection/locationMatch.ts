/**
 * Phase 3E — normalized venue / locality matching for wedding collections.
 * Operates only on already-loaded tenant wedding place scalars (list-light hydrate).
 * No synonym dictionary, no hard-coded venue names, no geocoder.
 */

import type { Wedding } from '@/types/wedding'

export type CollectionLocationRole =
  | 'preparations'
  | 'ceremony'
  | 'reception'
  | 'any'

const MAX_LOCATION_QUERY_LEN = 120

/**
 * Normalize location text for deterministic matching.
 * - trim / collapse whitespace
 * - case fold
 * - strip Polish diacritics
 * - drop light punctuation noise
 */
export function normalizeLocationText(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[.,;:!?'"`„”«»()/\\|_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Bound + normalize a CollectionQuery locationQuery string. Empty → null. */
export function normalizeLocationQuery(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null
  const sliced = String(raw).trim().slice(0, MAX_LOCATION_QUERY_LEN)
  const norm = normalizeLocationText(sliced)
  return norm.length >= 2 ? sliced.trim().slice(0, MAX_LOCATION_QUERY_LEN) : null
}

function pushUnique(hay: string[], value: string | null | undefined) {
  const t = value?.trim()
  if (!t) return
  if (!hay.some((h) => h === t)) hay.push(t)
}

/**
 * Authoritative place text already hydrated onto Wedding by list-light.
 * Role='any' uses primary + all role scalars + legacy couple venue/city.
 */
export function weddingLocationHaystack(
  wedding: Pick<
    Wedding,
    | 'primaryLocation'
    | 'receptionLocation'
    | 'ceremonyLocation'
    | 'bridePreparationLocation'
    | 'groomPreparationLocation'
    | 'preparationLocation'
    | 'couple'
  >,
  role: CollectionLocationRole = 'any',
): string[] {
  const out: string[] = []
  const prep = () => {
    pushUnique(out, wedding.bridePreparationLocation)
    pushUnique(out, wedding.groomPreparationLocation)
    pushUnique(out, wedding.preparationLocation)
  }
  if (role === 'reception') {
    pushUnique(out, wedding.receptionLocation)
    if (wedding.primaryLocation?.source === 'reception') {
      pushUnique(out, wedding.primaryLocation.venueName)
      pushUnique(out, wedding.primaryLocation.locality)
      pushUnique(out, wedding.primaryLocation.displayText)
    }
    return out
  }
  if (role === 'ceremony') {
    pushUnique(out, wedding.ceremonyLocation)
    if (wedding.primaryLocation?.source === 'ceremony') {
      pushUnique(out, wedding.primaryLocation.venueName)
      pushUnique(out, wedding.primaryLocation.locality)
      pushUnique(out, wedding.primaryLocation.displayText)
    }
    return out
  }
  if (role === 'preparations') {
    prep()
    if (
      wedding.primaryLocation?.source === 'preparation' ||
      wedding.primaryLocation?.source === 'legacy'
    ) {
      pushUnique(out, wedding.primaryLocation.venueName)
      pushUnique(out, wedding.primaryLocation.locality)
      pushUnique(out, wedding.primaryLocation.displayText)
    }
    return out
  }
  // any
  pushUnique(out, wedding.primaryLocation?.venueName)
  pushUnique(out, wedding.primaryLocation?.locality)
  pushUnique(out, wedding.primaryLocation?.displayText)
  pushUnique(out, wedding.receptionLocation)
  pushUnique(out, wedding.ceremonyLocation)
  prep()
  pushUnique(out, wedding.couple?.venue)
  pushUnique(out, wedding.couple?.city)
  return out
}

/**
 * Match precedence (deterministic):
 * 1. exact normalized field
 * 2. contained phrase on normalized field
 */
export function locationQueryMatchesHaystack(
  queryRaw: string,
  haystack: string[],
): boolean {
  const q = normalizeLocationText(queryRaw)
  if (q.length < 2) return false
  const norms = haystack.map(normalizeLocationText).filter((h) => h.length > 0)
  if (norms.some((h) => h === q)) return true
  if (norms.some((h) => h.includes(q))) return true
  return false
}

export function weddingMatchesLocationFilter(
  wedding: Parameters<typeof weddingLocationHaystack>[0],
  locationQuery: string | null | undefined,
  role: CollectionLocationRole = 'any',
): boolean {
  const q = normalizeLocationQuery(locationQuery)
  if (!q) return true
  return locationQueryMatchesHaystack(q, weddingLocationHaystack(wedding, role))
}
