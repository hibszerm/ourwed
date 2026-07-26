/**
 * Phase C — local context validation (document-ready patches).
 */

export function validateLocalContext(input: {
  before: string
  oldValue: string
  newValue: string
  after: string
}): { ok: boolean; reason: string | null } {
  const before = input.before
  const after = input.after
  const neu = input.newValue
  const composed = `${before}${neu}${after}`

  if (!neu.trim()) {
    return { ok: false, reason: 'Empty replacement' }
  }
  if (input.oldValue === neu) {
    return { ok: false, reason: 'Replacement equals original' }
  }

  // Duplicated currency
  if (/(zł|pln)\s*(zł|pln)/i.test(composed)) {
    return { ok: false, reason: 'Duplicated currency' }
  }
  // Duplicated r.
  if (/r\.\s*r\./i.test(composed) || /\d{4}r\.r\./i.test(composed)) {
    return { ok: false, reason: 'Duplicated r. suffix' }
  }
  // Duplicated package / labels
  if (/pakiecie\s+pakiecie/i.test(composed)) {
    return { ok: false, reason: 'Duplicated package label' }
  }
  if (/\bul\.?\s+ul\.?\b/i.test(composed)) {
    return { ok: false, reason: 'Duplicated ul. abbreviation' }
  }
  if (/\btel\.?\s+tel\.?\b/i.test(composed)) {
    return { ok: false, reason: 'Duplicated tel. abbreviation' }
  }
  if (/\b(NIP|REGON|PESEL|adres|konto)\s*:?\s+\1\s*:?/i.test(composed)) {
    return { ok: false, reason: 'Duplicated identity or payment label' }
  }
  const preposition =
    /\b(w|we|na|do|od|z|ze|pod|przy)\s*$/i.exec(before)?.[1]
  if (
    preposition &&
    new RegExp(`^\\s*${preposition}\\b`, 'i').test(neu)
  ) {
    return { ok: false, reason: 'Duplicated preposition' }
  }
  // Duplicated punctuation
  if (/([.,;:])\1/.test(composed.replace(/\d\.\d/g, 'X'))) {
    // allow decimal-like; still catch .. and ;;
    if (/\.\.|;{2}|::{2}/.test(composed)) {
      return { ok: false, reason: 'Duplicated punctuation' }
    }
  }
  // Malformed spacing
  if (/\s{3,}/.test(composed)) {
    return { ok: false, reason: 'Malformed spacing' }
  }
  const beforeLast = before.at(-1) ?? ''
  const newFirst = neu[0] ?? ''
  const newLast = neu.at(-1) ?? ''
  const afterFirst = after[0] ?? ''
  if (
    (/[\p{L}\p{N}]/u.test(beforeLast) &&
      /[\p{L}\p{N}]/u.test(newFirst)) ||
    (/[\p{L}\p{N}]/u.test(newLast) &&
      /[\p{L}\p{N}]/u.test(afterFirst))
  ) {
    return { ok: false, reason: 'Unsafe token boundary' }
  }
  if (/\b\d+(?:[.,]\d+)?(?:godzin|dni|miesięcy)\b/i.test(composed)) {
    return { ok: false, reason: 'Missing space before temporal unit' }
  }
  if (/\b(?:zł|PLN)(?:brutto|netto)\b/i.test(composed)) {
    return { ok: false, reason: 'Missing space after currency' }
  }
  if (/\br\.[\p{L}]/iu.test(composed)) {
    return { ok: false, reason: 'Missing space after date abbreviation' }
  }
  // Prefix/suffix preservation
  if (before && !composed.startsWith(before)) {
    return { ok: false, reason: 'Prefix lost' }
  }
  if (after && !composed.endsWith(after)) {
    return { ok: false, reason: 'Suffix lost' }
  }

  return { ok: true, reason: null }
}
