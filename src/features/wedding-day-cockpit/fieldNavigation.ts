/**
 * Field navigation + phone link helpers for Wedding Day Cockpit.
 * Prefer valid lat/lng for navigation; fall back to encoded address.
 */

import {
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
 * Build Google + Apple Maps navigation URLs for a destination.
 * Priority: valid coordinates → formatted address / label.
 */
export function buildFieldNavigationLinks(
  dest: NavigationDestination,
): FieldNavigationLinks {
  if (hasCoords(dest)) {
    const lat = dest.latitude!
    const lng = dest.longitude!
    const google = new URL('https://www.google.com/maps/dir/')
    google.searchParams.set('api', '1')
    google.searchParams.set('destination', `${lat},${lng}`)
    google.searchParams.set('travelmode', 'driving')
    google.searchParams.set('dir_action', 'navigate')

    const apple = new URL('https://maps.apple.com/')
    apple.searchParams.set('daddr', `${lat},${lng}`)
    apple.searchParams.set('dirflg', 'd')

    return { google: google.toString(), apple: apple.toString() }
  }

  const address = resolveNavigationDestinationAddress(dest)
  if (!address) return { google: null, apple: null }

  const google = new URL('https://www.google.com/maps/dir/')
  google.searchParams.set('api', '1')
  google.searchParams.set('destination', address)
  google.searchParams.set('travelmode', 'driving')
  google.searchParams.set('dir_action', 'navigate')

  const apple = new URL('https://maps.apple.com/')
  apple.searchParams.set('daddr', address)
  apple.searchParams.set('dirflg', 'd')

  return { google: google.toString(), apple: apple.toString() }
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
