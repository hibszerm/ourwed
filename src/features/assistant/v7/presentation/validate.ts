/**
 * Fail-closed validators for presentation action values.
 * No arbitrary protocols/URLs.
 */

import { normalizePhoneForHref } from '@/features/wedding-day-cockpit/fieldNavigation'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** UUID v4-ish / generic UUID — reject handles and free text. */
const ENTITY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidPresentationPhone(raw: string): boolean {
  return normalizePhoneForHref(raw) != null
}

export function isValidPresentationEmail(raw: string): boolean {
  const t = raw.trim()
  if (!t || t.length > 254) return false
  if (t.includes('://') || t.includes('javascript:')) return false
  return EMAIL_RE.test(t)
}

export function isValidPresentationAddress(raw: string): boolean {
  const t = raw.trim()
  if (t.length < 3) return false
  if (/^(javascript|data|vbscript):/i.test(t)) return false
  if (/^https?:\/\//i.test(t)) return false
  return true
}

export function isValidEntityId(raw: string): boolean {
  return ENTITY_ID_RE.test(raw.trim())
}

/** YYYY-MM-DD optional calendar hint — never used as authorization. */
export function isValidCalendarDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const d = new Date(`${raw}T12:00:00`)
  return !Number.isNaN(d.getTime())
}

export function scalarString(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim()
    return t.length > 0 ? t : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return null
}
