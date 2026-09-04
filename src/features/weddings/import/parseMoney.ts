const MAX_CONTRACT_VALUE = 10_000_000

/**
 * Polish wedding-spreadsheet money rules (V1):
 * - comma is the decimal separator when it is the last separator
 * - a single dot followed by exactly 3 digits is a thousands separator (10.500 → 10500)
 * - a single dot followed by 1–2 digits is a decimal (10.50 → 10.50)
 * - multiple dots are thousands grouping (1.234.567)
 * - "10.500,00" / "10,500.00" use the last separator as decimal
 * Negatives and amounts above 10 000 000 are invalid.
 */
function isMoneyCell(
  value: unknown,
): value is { raw: unknown; formatted?: string } {
  return typeof value === 'object' && value !== null && 'raw' in value
}

export function parseImportMoney(value: unknown): number | null {
  if (isMoneyCell(value)) {
    return parseImportMoneyFromCell(value)
  }
  if (value == null || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > MAX_CONTRACT_VALUE) {
      return null
    }
    return Math.round(value * 100) / 100
  }

  let text = String(value).trim()
  if (!text) return null
  if (/^-/.test(text) || text.includes('-')) return null

  text = text
    .replace(/\s+/g, '')
    .replace(/zł|pln/gi, '')
    .trim()

  const numbers = text.match(/\d[\d.,]*/g)
  if (!numbers || numbers.length !== 1) return null

  let num = numbers[0]!
  const comma = num.lastIndexOf(',')
  const dot = num.lastIndexOf('.')

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      num = num.replace(/\./g, '').replace(',', '.')
    } else {
      num = num.replace(/,/g, '')
    }
  } else if (comma >= 0) {
    const parts = num.split(',')
    if (parts.length === 2 && parts[1]!.length <= 2) {
      num = `${parts[0]!.replace(/\./g, '')}.${parts[1]}`
    } else {
      num = num.replace(/,/g, '')
    }
  } else if (dot >= 0) {
    const parts = num.split('.')
    if (parts.length > 2) {
      const last = parts[parts.length - 1]!
      if (last.length === 3) {
        num = parts.join('')
      } else if (last.length <= 2) {
        num = `${parts.slice(0, -1).join('')}.${last}`
      } else {
        num = parts.join('')
      }
    } else if (parts.length === 2) {
      const frac = parts[1]!
      if (frac.length === 3) {
        num = `${parts[0]}${frac}`
      }
    }
  }

  const parsed = Number(num)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_CONTRACT_VALUE) {
    return null
  }
  return Math.round(parsed * 100) / 100
}

/**
 * Prefer the formatted spreadsheet text when it encodes grouping
 * (e.g. "10.500") that a coerced numeric raw value would lose.
 */
export function parseImportMoneyFromCell(value: unknown): number | null {
  if (!isMoneyCell(value)) return parseImportMoney(value)
  const formatted = value.formatted?.trim()
  if (formatted) {
    const fromFormatted = parseImportMoney(formatted)
    if (fromFormatted != null) return fromFormatted
  }
  return parseImportMoney(value.raw)
}

export function isImportMoneyCellEmpty(value: unknown): boolean {
  if (value == null || value === '') return true
  if (isMoneyCell(value)) {
    const formatted = value.formatted?.trim() ?? ''
    const raw = value.raw
    if (formatted) return false
    return raw == null || raw === ''
  }
  return String(value).trim() === ''
}
