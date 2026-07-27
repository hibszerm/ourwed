/**
 * Strict Polish bank-account (NRB / IBAN) detection for protected-range derivation.
 */

export type BankAccountRange = {
  start: number
  end: number
  sourceText: string
  digitsOnly: string
}

const NRB_GROUPED =
  /(?<!\d)((?:PL\s*)?\d{2}(?:[ \u00a0\u202f]\d{4}){6})(?!\d)/gi

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function isBankAccountExactValue(value: string): boolean {
  const digits = digitsOnly(value)
  if (digits.length !== 26 && !(digits.length === 28 && digits.startsWith('PL'))) {
    return false
  }
  const nrb = digits.length === 28 ? digits.slice(2) : digits
  return nrb.length === 26
}

export function extractBankAccountRanges(text: string): BankAccountRange[] {
  const ranges: BankAccountRange[] = []
  for (const match of text.matchAll(NRB_GROUPED)) {
    const sourceText = match[1] ?? match[0]
    const start = match.index ?? text.indexOf(sourceText)
    if (start < 0) continue
    const digits = digitsOnly(sourceText)
    const nrb = digits.length >= 28 && digits.startsWith('PL') ? digits.slice(2) : digits
    if (nrb.length !== 26) continue
    ranges.push({
      start,
      end: start + sourceText.length,
      sourceText,
      digitsOnly: nrb,
    })
  }
  return ranges
}
