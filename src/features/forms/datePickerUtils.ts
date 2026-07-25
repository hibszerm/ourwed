/**
 * Polish date display / ISO storage helpers for questionnaire date fields.
 */

const WEEKDAYS_PL = ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd'] as const
const MONTHS_PL = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
] as const

export { WEEKDAYS_PL, MONTHS_PL }

/** Parse yyyy-MM-dd or dd.MM.yyyy → Date at local noon, or null. */
export function parseFlexibleDate(input: string): Date | null {
  const raw = input.trim()
  if (!raw) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0)
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return dt
    }
    return null
  }

  const pl = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw)
  if (pl) {
    const d = Number(pl[1])
    const m = Number(pl[2])
    const y = Number(pl[3])
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0)
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return dt
    }
    return null
  }

  return null
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function toPolishDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}.${m}.${y}`
}

export function isoToPolishDisplay(iso: string): string {
  const dt = parseFlexibleDate(iso)
  return dt ? toPolishDisplay(dt) : iso
}

/** Monday-first calendar cells for a month (null = empty pad). */
export function buildMonthGrid(year: number, monthIndex: number): (Date | null)[] {
  const first = new Date(year, monthIndex, 1, 12, 0, 0, 0)
  // JS: 0=Sun … convert to Mon=0
  const startPad = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(new Date(year, monthIndex, d, 12, 0, 0, 0))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
