/**
 * Polish duration inflection for coverage hours in contract prose.
 */

/** 1 godzina / 2 godziny / 5 godzin / 12 godzin */
export function polishHourWord(count: number): string {
  const n = Math.abs(Math.round(count))
  const mod10 = n % 10
  const mod100 = n % 100
  if (n === 1) return 'godzina'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'godziny'
  }
  return 'godzin'
}

/** Format "12 godzin" (number + inflected noun). */
export function formatPolishHours(count: number): string {
  const n = Math.round(count)
  return `${n} ${polishHourWord(n)}`
}

/**
 * Sanitize a coverage-duration replacement: never include a clock time.
 * Returns bare number when source span is numeric-only; full phrase when
 * source already contains "godzin*".
 */
export function formatCoverageDurationForSource(input: {
  hours: number
  sourceText: string
}): string {
  const src = input.sourceText.trim()
  const formatted = formatPolishHours(input.hours)
  if (/godzin/i.test(src)) return formatted
  // Numeric-only span — keep surrounding template inflection.
  return String(Math.round(input.hours))
}

/** Strip accidental clock times from a duration value. */
export function stripClockTimeFromDuration(value: string): string {
  return value
    .replace(/\s*\d{1,2}[.:]\d{2}\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Keep only HH:MM / HH.MM from a mixed string. */
export function extractClockTimeOnly(value: string): string | null {
  const m = value.trim().match(/\b(\d{1,2})([.:])(\d{2})\b/)
  if (!m) return null
  return `${m[1]!.padStart(2, '0')}${m[2]}${m[3]}`
}

export function looksLikeClockTime(value: string): boolean {
  return /^\d{1,2}[.:]\d{2}$/.test(value.trim())
}

export function durationContainsClockTime(value: string): boolean {
  return /\d{1,2}[.:]\d{2}/.test(value) && /godzin|\d{1,2}\s+\d{1,2}[.:]/i.test(value)
}
