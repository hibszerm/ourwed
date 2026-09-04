/**
 * Local calendar date keys (YYYY-MM-DD) for day grouping.
 * Prefer this over UTC-based ISO day strings (timezone midnight risk).
 *
 * Arithmetic uses civil Y-M-D components (never `new Date('YYYY-MM-DD')`).
 */

const LOCAL_DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

export function localCalendarDateKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Normalize a stored date / ISO timestamp to a local calendar key when possible. */
export function toLocalCalendarDateKey(value: string | null | undefined): string | null {
  if (!value) return null
  const day = value.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  return null
}

function parseLocalDay(key: string): { y: number; m: number; d: number } | null {
  const match = LOCAL_DATE_KEY.exec(key)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return null
  }
  return { y, m, d }
}

/** True when the key is a real Gregorian calendar day (rejects 2026-02-31). */
export function isValidLocalCalendarDateKey(value: string): boolean {
  const parsed = parseLocalDay(value)
  if (!parsed) return false
  const { y, m, d } = parsed
  if (m < 1 || m > 12 || d < 1) return false
  const lastDay = new Date(y, m, 0).getDate()
  return d <= lastDay
}

/** Add calendar days to a local YYYY-MM-DD key. */
export function addLocalCalendarDays(dayKey: string, days: number): string {
  const parsed = parseLocalDay(dayKey)
  if (!parsed) return dayKey
  const date = new Date(parsed.y, parsed.m - 1, parsed.d)
  date.setDate(date.getDate() + days)
  return localCalendarDateKey(date)
}

/**
 * Add calendar months to a local YYYY-MM-DD key (safe month-end clamp).
 * Aug 16 → Sep 16; Jan 31 → Feb 28/29.
 */
export function addLocalCalendarMonths(dayKey: string, months: number): string {
  const parsed = parseLocalDay(dayKey)
  if (!parsed) return dayKey
  const { y, m, d } = parsed
  const targetMonthIndex = m - 1 + months
  const year = y + Math.floor(targetMonthIndex / 12)
  const month = ((targetMonthIndex % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  return localCalendarDateKey(new Date(year, month, Math.min(d, lastDay)))
}
