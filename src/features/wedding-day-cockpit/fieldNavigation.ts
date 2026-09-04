/**
 * Field destination links for Wedding Day Cockpit.
 * Open the place for inspection and route choice — do not start turn-by-turn.
 */

import {
  googleMapsPlaceUrl,
  resolveNavigationDestinationAddress,
  type NavigationDestination,
} from '@/services/googleMapsLinks'

function hasCoords(dest: NavigationDestination): boolean {
  return (
    dest.latitude != null &&
    dest.longitude != null &&
    Number.isFinite(dest.latitude) &&
    Number.isFinite(dest.longitude)
  )
}

export type FieldNavigationLinks = {
  google: string | null
  apple: string | null
}

/**
 * Apple Maps destination/place view.
 * Prefer a named address/place; coordinates only as fallback.
 * Does not set daddr / dirflg (those start driving directions).
 */
export function appleMapsPlaceUrl(dest: NavigationDestination): string | null {
  const human = resolveNavigationDestinationAddress(dest)
  if (!human && !hasCoords(dest)) return null

  const url = new URL('https://maps.apple.com/')
  if (human) {
    url.searchParams.set('q', human)
    if (hasCoords(dest)) {
      url.searchParams.set('ll', `${dest.latitude},${dest.longitude}`)
    }
    return url.toString()
  }

  url.searchParams.set('ll', `${dest.latitude},${dest.longitude}`)
  return url.toString()
}

/**
 * Build Google + Apple Maps destination URLs.
 * Priority: Google Place ID → human-readable place/address → coordinates.
 */
export function buildFieldNavigationLinks(
  dest: NavigationDestination,
): FieldNavigationLinks {
  return {
    google: googleMapsPlaceUrl(dest),
    apple: appleMapsPlaceUrl(dest),
  }
}

/** Digits / leading + for tel: and sms: — does not mutate stored display values. */
export function normalizePhoneForHref(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const keep = trimmed.replace(/[^\d+]/g, '')
  if (keep.replace(/\D/g, '').length < 6) return null
  return keep
}

export function buildTelHref(phone: string): string | null {
  const n = normalizePhoneForHref(phone)
  return n ? `tel:${n}` : null
}

export function buildSmsHref(phone: string): string | null {
  const n = normalizePhoneForHref(phone)
  return n ? `sms:${n}` : null
}
