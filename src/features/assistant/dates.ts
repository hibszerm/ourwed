/**
 * Local calendar date helpers for Assistant V1.
 * Prefer product localCalendarDateKey — never UTC day assumptions.
 */

import {
  addLocalCalendarDays,
  isValidLocalCalendarDateKey,
  localCalendarDateKey,
} from '@/lib/utils/localCalendarDate'

const MONTH_LOOKUP: Array<[RegExp, number]> = [
  [/stycz/i, 1],
  [/lut/i, 2],
  [/mar/i, 3],
  [/kwie/i, 4],
  [/maj/i, 5],
  [/czerw/i, 6],
  [/lip/i, 7],
  [/sierp/i, 8],
  [/wrze/i, 9],
  [/paździer|pazdzier/i, 10],
  [/listopad/i, 11],
  [/grudn/i, 12],
]

export function resolveRelativeScheduleDate(
  raw: string,
  todayKey: string = localCalendarDateKey(),
): string | null {
  const q = raw.trim().toLowerCase().replace(/[?.!…]+$/g, '').trim()
  if (!q) return null
  if (q === 'dziś' || q === 'dzis' || q === 'today') return todayKey
  if (q === 'jutro' || q === 'tomorrow') return addLocalCalendarDays(todayKey, 1)
  if (q === 'pojutrze') return addLocalCalendarDays(todayKey, 2)
  if (isValidLocalCalendarDateKey(q)) return q
  return parsePolishDatePhrase(q, todayKey)
}

/**
 * Parse phrases like "20.09", "20.09.2026", "19 września", "19 września 2026".
 */
export function parsePolishDatePhrase(
  raw: string,
  todayKey: string = localCalendarDateKey(),
): string | null {
  const text = raw.trim().toLowerCase()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso && isValidLocalCalendarDateKey(iso[0]!)) return iso[0]!

  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/)
  if (dotted) {
    const day = Number(dotted[1])
    const month = Number(dotted[2])
    let year = dotted[3] ? Number(dotted[3]) : Number(todayKey.slice(0, 4))
    if (dotted[3] && dotted[3].length === 2) year += 2000
    if (!dotted[3]) {
      const candidate = formatKey(year, month, day)
      if (candidate && candidate < todayKey) {
        return formatKey(year + 1, month, day)
      }
      return candidate
    }
    return formatKey(year, month, day)
  }

  const named = text.match(
    /^(\d{1,2})\s+([a-ząćęłńóśźż]+)(?:\s+(\d{4}))?$/i,
  )
  if (named) {
    const day = Number(named[1])
    const monthToken = named[2]!
    let month = 0
    for (const [re, m] of MONTH_LOOKUP) {
      if (re.test(monthToken)) {
        month = m
        break
      }
    }
    if (!month) return null
    const year = named[3] ? Number(named[3]) : Number(todayKey.slice(0, 4))
    const candidate = formatKey(year, month, day)
    if (!named[3] && candidate && candidate < todayKey) {
      return formatKey(year + 1, month, day)
    }
    return candidate
  }

  return null
}

/**
 * For WRITE create without year: offer current and next year options.
 * With full year: return ok date.
 */
export function resolveWriteDateWithYearOptions(
  raw: string,
  todayKey: string = localCalendarDateKey(),
):
  | { ok: true; date: string }
  | {
      ok: false
      needsYearChoice: true
      yearOptions: string[]
      dayMonth: { day: number; month: number }
    }
  | { ok: false; needsYearChoice: false } {
  const text = raw.trim()
  const dottedNoYear = text.match(/^(\d{1,2})[./-](\d{1,2})$/)
  if (dottedNoYear) {
    const day = Number(dottedNoYear[1])
    const month = Number(dottedNoYear[2])
    const y = Number(todayKey.slice(0, 4))
    const a = formatKey(y, month, day)
    const b = formatKey(y + 1, month, day)
    if (!a || !b) return { ok: false, needsYearChoice: false }
    return {
      ok: false,
      needsYearChoice: true,
      yearOptions: [a, b],
      dayMonth: { day, month },
    }
  }

  const namedNoYear = text.match(/^(\d{1,2})\s+([a-ząćęłńóśźż]+)$/i)
  if (namedNoYear) {
    const day = Number(namedNoYear[1])
    let month = 0
    for (const [re, m] of MONTH_LOOKUP) {
      if (re.test(namedNoYear[2]!)) {
        month = m
        break
      }
    }
    if (!month) return { ok: false, needsYearChoice: false }
    const y = Number(todayKey.slice(0, 4))
    const a = formatKey(y, month, day)
    const b = formatKey(y + 1, month, day)
    if (!a || !b) return { ok: false, needsYearChoice: false }
    return {
      ok: false,
      needsYearChoice: true,
      yearOptions: [a, b],
      dayMonth: { day, month },
    }
  }

  const parsed = parsePolishDatePhrase(text, todayKey)
  if (!parsed) return { ok: false, needsYearChoice: false }
  return { ok: true, date: parsed }
}

export function formatPolishLongDate(dateKey: string): string {
  if (!isValidLocalCalendarDateKey(dateKey)) return dateKey
  const [y, m, d] = dateKey.split('-').map(Number)
  const months = [
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
  ]
  return `${d} ${months[(m ?? 1) - 1]} ${y}`
}

const MONTH_NOMINATIVE = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
] as const

const MONTH_GENITIVE = [
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

export type AssistantDateRange = {
  from: string
  to: string
  /** Uppercase month label e.g. "SIERPIEŃ 2026" or "TEN MIESIĄC" style. */
  titleLabel: string
  /** Quiet secondary e.g. "1–31 sierpnia". */
  rangeLabel: string
  year: number
  month: number
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function monthRange(year: number, month: number): AssistantDateRange | null {
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null
  const last = daysInMonth(year, month)
  const from = formatKey(year, month, 1)
  const to = formatKey(year, month, last)
  if (!from || !to) return null
  return {
    from,
    to,
    titleLabel: `${MONTH_NOMINATIVE[month - 1]!.toUpperCase()} ${year}`,
    rangeLabel: `1–${last} ${MONTH_GENITIVE[month - 1]}`,
    year,
    month,
  }
}

/**
 * Full calendar year — closed/bounded local range (not open-ended future).
 * month=0 marks a year span (not a single month).
 */
function yearRange(year: number): AssistantDateRange | null {
  if (year < 2000 || year > 2100) return null
  const from = formatKey(year, 1, 1)
  const to = formatKey(year, 12, 31)
  if (!from || !to) return null
  return {
    from,
    to,
    titleLabel: String(year),
    rangeLabel: `1 stycznia – 31 grudnia ${year}`,
    year,
    month: 0,
  }
}

function extractMonthNumber(text: string): number | null {
  for (const [re, m] of MONTH_LOOKUP) {
    if (re.test(text)) return m
  }
  return null
}

/**
 * Resolve aggregate month / year / relative phrases to a local calendar range.
 * READ-only year rule for bare month names: use the current local year.
 * Calendar years are closed: next/this/previous year = Jan 1 .. Dec 31 only
 * (never open-ended "from year onward").
 */
export function resolveAggregateDateRange(
  raw: string,
  todayKey: string = localCalendarDateKey(),
): AssistantDateRange | null {
  const q = raw
    .trim()
    .toLowerCase()
    .replace(/[?.!…]+$/g, '')
    .trim()
  if (!q) return null

  const yNow = Number(todayKey.slice(0, 4))
  const mNow = Number(todayKey.slice(5, 7))

  if (
    /^(ten miesiąc|w tym miesiącu|tego miesiąca|bieżący miesiąc)$/i.test(q) ||
    /\b(w )?tym miesiącu\b/i.test(q) ||
    /\bten miesiąc\b/i.test(q)
  ) {
    return monthRange(yNow, mNow)
  }

  if (
    /^(przyszły miesiąc|w przyszłym miesiącu|następny miesiąc)$/i.test(q) ||
    /\b(w )?przyszł(ym|y) miesiącu?\b/i.test(q) ||
    /\bnastępn(y|ym) miesiącu?\b/i.test(q)
  ) {
    const next = mNow === 12 ? { y: yNow + 1, m: 1 } : { y: yNow, m: mNow + 1 }
    return monthRange(next.y, next.m)
  }

  // Calendar year relatives — after month relatives so "przyszły miesiąc" wins.
  if (
    /^(ten rok|w tym roku|tego roku|bieżący rok|this year)$/i.test(q) ||
    /\b(w )?tym roku\b/i.test(q) ||
    /\bten rok\b/i.test(q) ||
    /\bthis year\b/i.test(q)
  ) {
    return yearRange(yNow)
  }

  if (
    /^(przyszły rok|w przyszłym roku|następny rok|next year)$/i.test(q) ||
    /\b(w )?przyszł(ym|y) roku?\b/i.test(q) ||
    /\bnastępn(y|ym) roku?\b/i.test(q) ||
    /\bnext year\b/i.test(q)
  ) {
    return yearRange(yNow + 1)
  }

  if (
    /^(zeszły rok|w zeszłym roku|poprzedni rok|w poprzednim roku|ubiegły rok|previous year|last year)$/i.test(
      q,
    ) ||
    /\b(w )?(zeszł|poprzedn|ubiegł)(ym|y) roku?\b/i.test(q) ||
    /\b(previous|last) year\b/i.test(q)
  ) {
    return yearRange(yNow - 1)
  }

  // Explicit year: "sierpień 2026", "we wrześniu 2025"
  const withYear = q.match(
    /(?:w|we)?\s*([a-ząćęłńóśźż]+)\s+(\d{4})|(?:w|we)?\s*(\d{4})\s+([a-ząćęłńóśźż]+)/i,
  )
  if (withYear) {
    const monthToken = withYear[1] ?? withYear[4]
    const year = Number(withYear[2] ?? withYear[3])
    const month = monthToken ? extractMonthNumber(monthToken) : null
    if (month && year) return monthRange(year, month)
  }

  // Bare month: "w sierpniu", "sierpień", "we wrześniu"
  const monthOnly = extractMonthNumber(q)
  if (monthOnly) {
    return monthRange(yNow, monthOnly)
  }

  // ISO month "2026-08"
  const isoMonth = q.match(/^(\d{4})-(\d{2})$/)
  if (isoMonth) {
    return monthRange(Number(isoMonth[1]), Number(isoMonth[2]))
  }

  // Bare calendar year "2027"
  const bareYear = q.match(/^(\d{4})$/)
  if (bareYear) {
    return yearRange(Number(bareYear[1]))
  }

  return null
}

function formatKey(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return isValidLocalCalendarDateKey(key) ? key : null
}
