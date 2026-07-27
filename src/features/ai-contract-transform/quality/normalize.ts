/**
 * Deterministic normalization for completeness / financial matching.
 */

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function foldPolish(s: string): string {
  return s
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

export function stripLocationPrefixes(s: string): string {
  return collapseWhitespace(
    s
      .replace(/\bpod\s+adresem:?\s*/gi, ' ')
      .replace(/\bprzy\s+ul\.?\s*/gi, ' ')
      .replace(/\bw\s+miejscu\s+(przyjęcia|ceremonii|przygotowań)[:\s]*/gi, ' ')
      .replace(/\b(ul\.|aleja|al\.|os\.|pl\.)\s*/gi, ' ')
      .replace(/^w\s+/i, ' ')
      .replace(/^we\s+/i, ' '),
  )
}

export function normalizeForMatch(s: string): string {
  return foldPolish(
    stripLocationPrefixes(
      collapseWhitespace(s).replace(/[„"”'′]/g, '').replace(/[.,;:()]/g, ' '),
    ),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizePhone(s: string): string {
  return s.replace(/[^\d+]/g, '')
}

export function normalizeDateDigits(s: string): string {
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (!m) return normalizeForMatch(s)
  const dd = m[1]!.padStart(2, '0')
  const mm = m[2]!.padStart(2, '0')
  let yyyy = m[3]!
  if (yyyy.length === 2) yyyy = `20${yyyy}`
  return `${dd}.${mm}.${yyyy}`
}

export function normalizeMoneyDigits(s: string): string {
  const digits = s.replace(/[^\d]/g, '')
  return digits
}

export function textContainsNormalized(
  haystack: string,
  needle: string,
): boolean {
  const n = normalizeForMatch(needle)
  if (!n || n.length < 3) return false
  const h = normalizeForMatch(haystack)
  if (h.includes(n)) return true
  // phone / date / money variants
  const phoneN = normalizePhone(needle)
  if (phoneN.length >= 9 && normalizePhone(haystack).includes(phoneN)) return true
  const dateN = normalizeDateDigits(needle)
  if (/\d{2}\.\d{2}\.\d{4}/.test(dateN) && normalizeDateDigits(haystack) === dateN)
    return true
  if (haystack.includes(dateN)) return true
  const moneyN = normalizeMoneyDigits(needle)
  if (moneyN.length >= 3) {
    const moneyRe = new RegExp(
      moneyN.split('').join('[\\s\\u00a0]*'),
    )
    if (moneyRe.test(haystack.replace(/\u00a0/g, ' '))) return true
  }
  return false
}

export function fingerprintText(value: string): string {
  const compact = value.replace(/\s+/g, '')
  let hash = 0
  for (let i = 0; i < compact.length; i++) {
    hash = (hash * 31 + compact.charCodeAt(i)) >>> 0
  }
  return `len${compact.length}:${hash.toString(16)}`
}

export function sanitizeDuplicatedLocationWrappers(text: string): string {
  let out = text
  out = out.replace(/\bpod\s+adresem:\s*pod\s+adresem:?\s*/gi, 'pod adresem: ')
  out = out.replace(/\bprzy\s+ul\.\s*ul\.\s*/gi, 'przy ul. ')
  out = out.replace(/:\s*pod\s+adresem:/gi, ': ')
  out = out.replace(/\bpod\s+adresem:\s*Bazylik/gi, 'w Bazylik')
  return out
}
