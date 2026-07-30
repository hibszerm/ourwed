/**
 * Compare current Wedding values vs Pre-Wedding answers for sync candidates.
 */

import {
  answerToGeoPlace,
  formatLocationAnswerDisplay,
  locationAnswerToPlainText,
} from '@/features/prewedding/preweddingLocation'
import {
  isPlaceholderValue,
  normalizeComparableText,
  normalizeDateValue,
  normalizePhoneDigits,
  normalizeTimeValue,
} from '@/features/prewedding/weddingDaySync/mappingCatalog'
import type { GeoPlace, WeddingPlace } from '@/types/travel'

export type LocationRichness = 'verified' | 'manual' | 'text' | 'empty'

export function locationRichness(
  place: GeoPlace | WeddingPlace | null | undefined,
): LocationRichness {
  if (!place) return 'empty'
  const lat =
    'latitude' in place
      ? place.latitude
      : (place as WeddingPlace).latitude
  const lng =
    'longitude' in place
      ? place.longitude
      : (place as WeddingPlace).longitude
  const hasCoords =
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng)
  const placeId =
    'placeId' in place
      ? place.placeId
      : (place as WeddingPlace).placeId
  if (hasCoords || (typeof placeId === 'string' && placeId.trim())) {
    return 'verified'
  }
  const formatted =
    ('formattedAddress' in place && place.formattedAddress?.trim()) || ''
  const label = ('label' in place && place.label?.trim()) || ''
  if (formatted || label) return 'manual'
  return 'empty'
}

export function richnessRank(r: LocationRichness): number {
  switch (r) {
    case 'verified':
      return 3
    case 'manual':
      return 2
    case 'text':
      return 1
    default:
      return 0
  }
}

export function displayLocationValue(
  place: GeoPlace | WeddingPlace | null | undefined,
  fallbackText?: string,
): string {
  if (place) {
    const label = ('label' in place && place.label?.trim()) || ''
    const formatted =
      ('formattedAddress' in place && place.formattedAddress?.trim()) || ''
    if (label && formatted && label !== formatted) {
      return `${label} — ${formatted}`
    }
    if (formatted) return formatted
    if (label) return label
  }
  const fb = fallbackText?.trim() ?? ''
  return fb
}

export function geoPlacesEqual(
  a: GeoPlace | null,
  b: GeoPlace | WeddingPlace | null,
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false

  const aId = a.placeId?.trim() || null
  const bId =
    ('placeId' in b ? b.placeId?.trim() : null) || null
  if (aId && bId && aId === bId) return true

  const aLat = a.latitude
  const aLng = a.longitude
  const bLat = 'latitude' in b ? b.latitude : null
  const bLng = 'longitude' in b ? b.longitude : null
  if (
    typeof aLat === 'number' &&
    typeof aLng === 'number' &&
    typeof bLat === 'number' &&
    typeof bLng === 'number' &&
    Math.abs(aLat - bLat) < 0.00015 &&
    Math.abs(aLng - bLng) < 0.00015
  ) {
    return true
  }

  const aText = normalizeComparableText(
    displayLocationValue(a) || formatLocationAnswerDisplay(a),
  )
  const bText = normalizeComparableText(displayLocationValue(b))
  return Boolean(aText) && aText === bText
}

export function valuesAreSemanticallyEqual(
  mapping: string,
  current: string,
  proposed: string,
  opts?: {
    currentGeo?: GeoPlace | WeddingPlace | null
    proposedGeo?: GeoPlace | null
  },
): boolean {
  if (opts?.proposedGeo || opts?.currentGeo) {
    const proposedGeo =
      opts.proposedGeo ?? answerToGeoPlace(proposed) ?? null
    if (geoPlacesEqual(proposedGeo, opts.currentGeo ?? null)) return true
  }

  const cur = current.trim()
  const prop = proposed.trim()
  if (!prop) return true
  if (isPlaceholderValue(cur) && !isPlaceholderValue(prop)) return false
  if (isPlaceholderValue(cur) && isPlaceholderValue(prop)) return true

  if (mapping.endsWith('Phone') || mapping === 'bridePhone' || mapping === 'groomPhone') {
    const a = normalizePhoneDigits(cur)
    const b = normalizePhoneDigits(prop)
    return Boolean(a) && a === b
  }
  if (mapping === 'weddingDate') {
    return normalizeDateValue(cur) === normalizeDateValue(prop)
  }
  if (mapping.endsWith('Time') || mapping === 'ceremonyTime') {
    return normalizeTimeValue(cur) === normalizeTimeValue(prop)
  }

  return normalizeComparableText(cur) === normalizeComparableText(prop)
}

export function proposedDisplayFromAnswer(raw: unknown): string {
  const geo = answerToGeoPlace(raw)
  if (geo) return displayLocationValue(geo)
  return locationAnswerToPlainText(raw).trim()
}
