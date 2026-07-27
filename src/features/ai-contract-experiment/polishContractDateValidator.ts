/**
 * Polish contract date token validation (scalar spans only).
 */

export type PolishContractDateValidation = {
  valid: boolean
  normalizedIso?: string
  format?: string
  reason?: string
}

const NUMERIC_DATE =
  /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(\s*r\.?)?$/i

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(\s*r\.?)?$/i

const POLISH_MONTHS: Record<string, number> = {
  stycznia: 1,
  lutego: 2,
  marca: 3,
  kwietnia: 4,
  maja: 5,
  czerwca: 6,
  lipca: 7,
  sierpnia: 8,
  września: 9,
  października: 10,
  listopada: 11,
  grudnia: 12,
}

const TEXTUAL_DATE =
  /^(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+(\d{4})(\s*r\.?)?$/i

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(day: number, month: number, year: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function validatePolishContractDateToken(
  exactValue: string,
): PolishContractDateValidation {
  const trimmed = exactValue.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { valid: false, reason: 'empty_date' }
  if (trimmed.length > 40) {
    return { valid: false, reason: 'non_minimal_date_span' }
  }

  let m = trimmed.match(NUMERIC_DATE)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2])
    const year = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { valid: false, reason: 'invalid_date_parts' }
    }
    return {
      valid: true,
      normalizedIso: toIso(day, month, year),
      format: m[4] ? 'dd.mm.yyyy r.' : 'dd.mm.yyyy',
    }
  }

  m = trimmed.match(ISO_DATE)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { valid: false, reason: 'invalid_date_parts' }
    }
    return {
      valid: true,
      normalizedIso: toIso(day, month, year),
      format: 'yyyy-mm-dd',
    }
  }

  m = trimmed.match(TEXTUAL_DATE)
  if (m) {
    const day = Number(m[1])
    const month = POLISH_MONTHS[m[2]!.toLowerCase()]!
    const year = Number(m[3])
    if (!month || day < 1 || day > 31) {
      return { valid: false, reason: 'invalid_textual_date' }
    }
    return {
      valid: true,
      normalizedIso: toIso(day, month, year),
      format: 'd month yyyy',
    }
  }

  if (/\b(dnia|zawarta|wydarzenia|data)\b/i.test(trimmed)) {
    return { valid: false, reason: 'non_minimal_date_span' }
  }

  return { valid: false, reason: 'unrecognized_date_format' }
}

/** Extract all date token candidates from a broader string. */
export function extractPolishDateTokens(text: string): string[] {
  const raw: string[] = []
  const patterns = [
    /\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}\s*r\.?/gi,
    /\d{4}-\d{2}-\d{2}\s*r\.?/gi,
    /\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}\s*r\.?/gi,
    /\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}/gi,
  ]
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const token = m[0]!.trim()
      if (validatePolishContractDateToken(token).valid) raw.push(token)
    }
  }
  const unique = [...new Set(raw)]
  return unique.filter(
    (token, _i, arr) =>
      !arr.some(
        (other) => other !== token && other.includes(token) && other.length > token.length,
      ),
  )
}
