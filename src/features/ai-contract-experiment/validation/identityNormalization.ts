/**
 * Identity comparison normalization — supporting evidence only, never mutates source span.
 */

export type IdentityNormalization = {
  sourceValueExact: string
  sourceValueComparisonForm: string
  appearsInflected: boolean
}

const HONORIFICS =
  /^(?:p\.|pan|pani|państwo|mr|mrs|ms|dr|prof)\.?\s+/i

const INSTRUMENTAL_SUFFIX = /[ąę]$/
const LOCATIVE_SUFFIX = /(u|ie|owi|em|om|ach|ami)$/i

export function normalizeIdentityForComparison(source: string): IdentityNormalization {
  let exact = source.trim()
  let comparison = exact
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(HONORIFICS, '')
    .trim()

  const tokens = comparison.split(/\s+/).filter(Boolean)
  const appearsInflected = tokens.some(
    (token) =>
      INSTRUMENTAL_SUFFIX.test(token) || LOCATIVE_SUFFIX.test(token),
  )

  comparison = comparison
    .toLowerCase()
    .replace(/[.,;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    sourceValueExact: exact,
    sourceValueComparisonForm: comparison,
    appearsInflected,
  }
}

export function normalizePhoneForComparison(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function phonesEquivalent(a: string, b: string): boolean {
  const na = normalizePhoneForComparison(a)
  const nb = normalizePhoneForComparison(b)
  if (!na || !nb) return false
  return na === nb || na.endsWith(nb) || nb.endsWith(na)
}
