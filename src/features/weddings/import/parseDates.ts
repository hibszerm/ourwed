import * as XLSXNamespace from 'xlsx'
import type { SpreadsheetCellValue } from './types'

/** Vite ESM has named exports; Node CJS interop often nests under `.default`. */
const XLSX =
  (XLSXNamespace as { default?: typeof XLSXNamespace }).default ??
  XLSXNamespace

export type ParseImportDateIssueCode =
  | 'IMPORT_DATE_PARSE_FAILED'
  | 'IMPORT_DATE_YEAR_MISSING'

export type ParseImportDateResult = {
  date: string | null
  issueCode?: ParseImportDateIssueCode
  sourceDisplay?: string
}

export type ParseImportDateContext = {
  sheetName?: string
  date1904?: boolean
}

const POLISH_MONTH_ALIASES: Record<string, number> = {
  sty: 1,
  stycz: 1,
  styczen: 1,
  stycznia: 1,
  lut: 2,
  luty: 2,
  lutego: 2,
  mar: 3,
  marzec: 3,
  marca: 3,
  kwi: 4,
  kwie: 4,
  kwiecien: 4,
  kwietnia: 4,
  maj: 5,
  maja: 5,
  cze: 6,
  czerw: 6,
  czerwiec: 6,
  czerwca: 6,
  lip: 7,
  lipiec: 7,
  lipca: 7,
  sie: 8,
  sierp: 8,
  sierpien: 8,
  sierpnia: 8,
  wrz: 9,
  wrzes: 9,
  wrzesien: 9,
  wrzesnia: 9,
  paz: 10,
  pazdz: 10,
  pazdziernik: 10,
  pazdziernika: 10,
  lis: 11,
  listopad: 11,
  listopada: 11,
  gru: 12,
  grudzien: 12,
  grudnia: 12,
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function normalizeMonthToken(token: string): string {
  return token
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\./g, '')
}

function resolvePolishMonth(token: string): number | null {
  const key = normalizeMonthToken(token)
  return POLISH_MONTH_ALIASES[key] ?? null
}

function toIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const probe = new Date(year, month - 1, day)
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function dateToIsoLocal(date: Date): string | null {
  return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function excelSerialToIso(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 60000) return null
  const adjusted = date1904 ? serial + 1462 : serial
  const parts = XLSX.SSF.parse_date_code(adjusted)
  if (!parts) return null
  return toIso(parts.y, parts.m, parts.d)
}

function extractYearFromSheetName(sheetName?: string): number | null {
  if (!sheetName) return null
  const match = sheetName.match(/\b(20\d{2})\b/)
  if (!match) return null
  const year = Number(match[1])
  return year >= 1900 && year <= 2100 ? year : null
}

function parsePolishAbbreviatedDate(
  text: string,
  context?: ParseImportDateContext,
): ParseImportDateResult {
  const normalized = text.trim().replace(/\s+/g, ' ')
  const match = normalized.match(
    /^(\d{1,2})[\s.\-/]+([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż.]+)(?:[\s.\-/]+(\d{4}))?\.?$/i,
  )
  if (!match) {
    return {
      date: null,
      issueCode: 'IMPORT_DATE_PARSE_FAILED',
      sourceDisplay: text,
    }
  }

  const day = Number(match[1])
  const month = resolvePolishMonth(match[2]!)
  const explicitYear = match[3] ? Number(match[3]) : null

  if (!month) {
    return {
      date: null,
      issueCode: 'IMPORT_DATE_PARSE_FAILED',
      sourceDisplay: text,
    }
  }

  if (explicitYear) {
    const date = toIso(explicitYear, month, day)
    return date
      ? { date, sourceDisplay: text }
      : {
          date: null,
          issueCode: 'IMPORT_DATE_PARSE_FAILED',
          sourceDisplay: text,
        }
  }

  const sheetYear = extractYearFromSheetName(context?.sheetName)
  if (sheetYear) {
    const date = toIso(sheetYear, month, day)
    return date
      ? { date, sourceDisplay: text }
      : {
          date: null,
          issueCode: 'IMPORT_DATE_PARSE_FAILED',
          sourceDisplay: text,
        }
  }

  return {
    date: null,
    issueCode: 'IMPORT_DATE_YEAR_MISSING',
    sourceDisplay: text,
  }
}

function parseNumericDateText(text: string): string | null {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dotted = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dotted) {
    return toIso(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]))
  }

  const slashed = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashed) {
    return toIso(Number(slashed[3]), Number(slashed[2]), Number(slashed[1]))
  }

  const usShort = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (usShort) {
    const year = 2000 + Number(usShort[3]!)
    return toIso(year, Number(usShort[1]), Number(usShort[2]))
  }

  return null
}

function parsePolishLongTextDate(text: string): string | null {
  const m = text
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})$/)
  if (!m) return null
  const month = resolvePolishMonth(m[2]!)
  if (!month) return null
  return toIso(Number(m[3]), month, Number(m[1]))
}

export function isSpreadsheetCellValue(value: unknown): value is SpreadsheetCellValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'raw' in value &&
    (value as SpreadsheetCellValue).raw !== undefined
  )
}

export function spreadsheetCellDisplay(value: unknown): string {
  if (isSpreadsheetCellValue(value)) {
    const formatted = value.formatted?.trim()
    if (formatted) return formatted
    if (value.raw instanceof Date) return dateToIsoLocal(value.raw) ?? ''
    if (value.raw == null) return ''
    return String(value.raw).trim()
  }
  if (value instanceof Date) return dateToIsoLocal(value) ?? ''
  return String(value ?? '').trim()
}

export function spreadsheetCellRaw(value: unknown): unknown {
  if (isSpreadsheetCellValue(value)) {
    return value.raw ?? value.formatted
  }
  return value
}

function parseRawValue(
  raw: unknown,
  context?: ParseImportDateContext,
): ParseImportDateResult | null {
  if (raw == null || raw === '') return null

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const date = dateToIsoLocal(raw)
    return date
      ? { date }
      : { date: null, issueCode: 'IMPORT_DATE_PARSE_FAILED' }
  }

  if (typeof raw === 'number') {
    const date = excelSerialToIso(raw, context?.date1904)
    return date
      ? { date }
      : { date: null, issueCode: 'IMPORT_DATE_PARSE_FAILED' }
  }

  const text = String(raw).trim()
  if (!text) return null

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text)
    const date = excelSerialToIso(serial, context?.date1904)
    if (date) return { date, sourceDisplay: text }
  }

  const numeric = parseNumericDateText(text)
  if (numeric) return { date: numeric, sourceDisplay: text }

  const polishLong = parsePolishLongTextDate(text)
  if (polishLong) return { date: polishLong, sourceDisplay: text }

  if (/[a-ząćęłńóśźż]/i.test(text)) {
    return parsePolishAbbreviatedDate(text, context)
  }

  return null
}

export function parseImportDateDetailed(
  value: unknown,
  context?: ParseImportDateContext,
): ParseImportDateResult {
  if (value == null || value === '') {
    return { date: null, issueCode: 'IMPORT_DATE_PARSE_FAILED' }
  }

  if (isSpreadsheetCellValue(value)) {
    const sourceDisplay =
      value.formatted?.trim() ||
      (value.raw instanceof Date
        ? dateToIsoLocal(value.raw) ?? undefined
        : String(value.raw ?? '').trim()) ||
      undefined

    const fromRaw = parseRawValue(value.raw, context)
    if (fromRaw?.date) {
      return { ...fromRaw, sourceDisplay: sourceDisplay ?? fromRaw.sourceDisplay }
    }

    if (value.formatted?.trim()) {
      const fromFormatted = parseRawValue(value.formatted, context)
      if (fromFormatted?.date) {
        return {
          ...fromFormatted,
          sourceDisplay: value.formatted.trim(),
        }
      }
      if (fromFormatted?.issueCode) {
        return { ...fromFormatted, sourceDisplay: value.formatted.trim() }
      }
      const polish = parsePolishAbbreviatedDate(value.formatted.trim(), context)
      if (polish.date || polish.issueCode) {
        return { ...polish, sourceDisplay: value.formatted.trim() }
      }
    }

    if (fromRaw?.issueCode) {
      return { ...fromRaw, sourceDisplay }
    }

    return {
      date: null,
      issueCode: 'IMPORT_DATE_PARSE_FAILED',
      sourceDisplay,
    }
  }

  const parsed = parseRawValue(value, context)
  if (parsed?.date) return parsed
  if (parsed?.issueCode) return parsed

  const text = String(value).trim()
  if (/[a-ząćęłńóśźż]/i.test(text)) {
    return parsePolishAbbreviatedDate(text, context)
  }

  const numeric = parseNumericDateText(text)
  if (numeric) return { date: numeric, sourceDisplay: text }

  return {
    date: null,
    issueCode: 'IMPORT_DATE_PARSE_FAILED',
    sourceDisplay: text || undefined,
  }
}

/** Backward-compatible helper returning only the ISO date or null. */
export function parseImportDate(
  value: unknown,
  context?: ParseImportDateContext,
): string | null {
  return parseImportDateDetailed(value, context).date
}
