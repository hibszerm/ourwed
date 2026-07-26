/**
 * Frozen generation context for one AI Contract Lab analysis session.
 * Contract execution date must be computed once — never via scattered new Date().
 */

export type ContractGenerationContext = {
  /** ISO timestamp when the lab generation session started. */
  generatedAt: string
  timezone: string
  locale: 'pl-PL'
  /** Calendar date YYYY-MM-DD in the user timezone. */
  contractExecutionDate: string
  /** Polish document-style display, e.g. 29.07.2026 */
  contractExecutionDateFormatted: string
  /** Optional long form, e.g. 29 lipca 2026 r. */
  contractExecutionDateLong: string
}

const PL_MONTHS_GENITIVE = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
] as const

/** Calendar YYYY-MM-DD for an Instant in a given IANA timezone. */
export function calendarDateInTimezone(
  instant: Date,
  timezone: string,
): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant)
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const d = parts.find((p) => p.type === 'day')?.value
    if (y && m && d) return `${y}-${m}-${d}`
  } catch {
    // fall through
  }
  return instant.toISOString().slice(0, 10)
}

export function formatDotDatePl(isoDate: string): string {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return isoDate
  return `${m[3]}.${m[2]}.${m[1]}`
}

export function formatLongDatePl(isoDate: string): string {
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return isoDate
  const day = Number(m[3])
  const monthIdx = Number(m[2]) - 1
  const month = PL_MONTHS_GENITIVE[monthIdx] ?? m[2]
  return `${day} ${month} ${m[1]} r.`
}

/**
 * Create a generation context once per lab analysis/session.
 * Pass `now` / `timezone` in tests for determinism.
 */
export function createContractGenerationContext(input?: {
  now?: Date
  timezone?: string
  locale?: 'pl-PL'
}): ContractGenerationContext {
  const now = input?.now ?? new Date()
  const timezone =
    input?.timezone ??
    (typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'Europe/Warsaw')
  const locale = input?.locale ?? 'pl-PL'
  const contractExecutionDate = calendarDateInTimezone(now, timezone)
  return {
    generatedAt: now.toISOString(),
    timezone,
    locale,
    contractExecutionDate,
    contractExecutionDateFormatted: formatDotDatePl(contractExecutionDate),
    contractExecutionDateLong: formatLongDatePl(contractExecutionDate),
  }
}
