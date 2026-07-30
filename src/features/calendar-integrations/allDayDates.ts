/**
 * Calendar-date helpers for all-day external events.
 * Never use local midnight timestamps — only YYYY-MM-DD calendar dates.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/

/** Extract YYYY-MM-DD from a date string (ISO date or datetime prefix). */
export function toCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const match = DATE_RE.exec(trimmed)
  if (!match) return null
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

/** Add one calendar day in UTC calendar arithmetic (exclusive end for all-day). */
export function addOneCalendarDay(isoDate: string): string {
  const base = toCalendarDate(isoDate)
  if (!base) {
    throw new Error(`Invalid calendar date: ${isoDate}`)
  }
  const [y, m, d] = base.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d))
  utc.setUTCDate(utc.getUTCDate() + 1)
  return utc.toISOString().slice(0, 10)
}

/** Compact YYYYMMDD for ICS VALUE=DATE. */
export function toIcsDateValue(isoDate: string): string {
  const base = toCalendarDate(isoDate)
  if (!base) {
    throw new Error(`Invalid calendar date: ${isoDate}`)
  }
  return base.replaceAll('-', '')
}

/** Today as YYYY-MM-DD in the given IANA timezone (defaults to Europe/Warsaw). */
export function todayCalendarDate(
  timeZone = 'Europe/Warsaw',
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) {
    return now.toISOString().slice(0, 10)
  }
  return `${y}-${m}-${d}`
}

export function isCalendarDateOnOrAfter(
  eventDate: string,
  referenceDate: string,
): boolean {
  const a = toCalendarDate(eventDate)
  const b = toCalendarDate(referenceDate)
  if (!a || !b) return false
  return a >= b
}
