/**
 * Pre-wedding location answers — shared GeoPlace model (Wedding / Travel / Maps).
 * Legacy PreWeddingAddressAnswer-shaped JSON remains readable.
 */

import { getWeddingLocationDisplay } from '@/features/travel/weddingLocationModel'
import { googleMapsPlaceUrl } from '@/services/googleMapsLinks'
import type { GeoPlace } from '@/types/travel'

/** True when answer is a structured place (GeoPlace or legacy address object). */
export function isStructuredLocationAnswer(
  value: unknown,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    return false
  }
  const row = value as Record<string, unknown>
  return (
    typeof row.formattedAddress === 'string' ||
    typeof row.label === 'string' ||
    typeof row.name === 'string' ||
    typeof row.placeId === 'string'
  )
}

export function answerToGeoPlace(value: unknown): GeoPlace | null {
  if (value == null || value === '') return null

  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    return {
      placeId: null,
      formattedAddress: text,
      latitude: null,
      longitude: null,
      label: null,
      provider: null,
    }
  }

  if (!isStructuredLocationAnswer(value)) return null

  const formatted =
    (typeof value.formattedAddress === 'string' && value.formattedAddress.trim()) ||
    ''
  const label =
    (typeof value.label === 'string' && value.label.trim()) ||
    (typeof value.name === 'string' && value.name.trim()) ||
    null
  const placeId =
    typeof value.placeId === 'string' && value.placeId.trim()
      ? value.placeId.trim()
      : null
  const latitude =
    typeof value.latitude === 'number' && Number.isFinite(value.latitude)
      ? value.latitude
      : null
  const longitude =
    typeof value.longitude === 'number' && Number.isFinite(value.longitude)
      ? value.longitude
      : null

  if (!formatted && !label && !placeId) return null

  const legacySource = value.source
  const provider =
    typeof value.provider === 'string'
      ? value.provider
      : placeId || legacySource === 'google_places'
        ? 'google'
        : null

  return {
    placeId,
    formattedAddress: formatted || label || '',
    latitude,
    longitude,
    label: label && label !== formatted ? label : label,
    provider,
  }
}

/** Persist shared GeoPlace into questionnaire answers JSON. */
export function geoPlaceToAnswer(place: GeoPlace | null): GeoPlace | '' {
  if (!place) return ''
  const formatted = place.formattedAddress?.trim() || ''
  const label = place.label?.trim() || null
  if (!formatted && !label && !place.placeId) return ''
  return {
    placeId: place.placeId ?? null,
    formattedAddress: formatted || label || '',
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    label: label,
    provider: place.provider ?? (place.placeId ? 'google' : null),
  }
}

export function formatLocationAnswerDisplay(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie'
  if (Array.isArray(value)) return value.join(', ')
  const geo = answerToGeoPlace(value)
  if (geo) {
    const display = getWeddingLocationDisplay(geo)
    if (display.secondary) return `${display.primary} — ${display.secondary}`
    return display.primary
  }
  return String(value)
}

export function isAnswerEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false) {
    return true
  }
  if (Array.isArray(value) && value.length === 0) return true
  if (isStructuredLocationAnswer(value) || typeof value === 'string') {
    const geo = answerToGeoPlace(value)
    if (!geo) return true
    return !geo.formattedAddress.trim() && !geo.label?.trim() && !geo.placeId
  }
  return false
}

/** Scalar string for Wedding Day patch / proposals. */
export function locationAnswerToPlainText(value: unknown): string {
  return formatLocationAnswerDisplay(value)
}

export function googleMapsUrlForLocationAnswer(value: unknown): string | null {
  const geo = answerToGeoPlace(value)
  if (!geo) return null
  return googleMapsPlaceUrl(geo)
}

export function isManualLocationAnswer(value: unknown): boolean {
  const geo = answerToGeoPlace(value)
  if (!geo) return false
  if (geo.placeId?.trim()) return false
  if (geo.provider === 'google') return false
  if (
    isStructuredLocationAnswer(value) &&
    (value as { source?: string }).source === 'google_places'
  ) {
    return false
  }
  return true
}

/** @deprecated Use isStructuredLocationAnswer — kept for migration of imports. */
export const isPreWeddingAddressAnswer = isStructuredLocationAnswer
/** @deprecated Use formatLocationAnswerDisplay */
export const formatPreWeddingAnswerDisplay = formatLocationAnswerDisplay
/** @deprecated Use locationAnswerToPlainText */
export const addressAnswerToPlainText = locationAnswerToPlainText
/** @deprecated Use googleMapsUrlForLocationAnswer */
export const googleMapsUrlForAddress = googleMapsUrlForLocationAnswer
