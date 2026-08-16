/**
 * Local calendar date keys (YYYY-MM-DD) for day grouping.
 * Prefer this over UTC-based ISO day strings (timezone midnight risk).
 */

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
