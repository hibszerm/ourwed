/**
 * Golden Fix 2 — exact PLN amount surface matching (Polish money formats).
 *
 * Matching/normalization only — does not rewrite whole documents.
 * Surfaces include optional decimal cents (,00 / .00) and NBSP thousands.
 */

/** Full semantic PLN amount span (integer + optional cents + currency). */
export const PLN_AMOUNT_SURFACE_RE =
  /\d[\d\s\u00a0]*(?:[,.]\d{2})?\s*zł(?:otych|ote|oty)?/gi

export const PLN_AMOUNT_SURFACE_RE_ONCE =
  /\d[\d\s\u00a0]*(?:[,.]\d{2})?\s*zł(?:otych|ote|oty)?/i

/** Reject cents-only / trivial fragments inventoried as amounts. */
export function isTrivialPlnAmountSurface(surface: string): boolean {
  const n = parsePlnAmountInteger(surface)
  if (n == null) return true
  // Pure cents fragments like "00 zł" parse as 0
  if (n === 0) return true
  return false
}

/**
 * Parse PLN surface to złoty integer (ignore ,xx / .xx cents).
 * "11 200,00 zł" → 11200; "8 400 zł" → 8400; "00 zł" → 0.
 */
export function parsePlnAmountInteger(raw: string): number | null {
  const cleaned = raw
    .replace(/\u00a0/g, ' ')
    .replace(/\s*zł(?:otych|ote|oty)?\s*$/i, '')
    .trim()
  if (!cleaned) return null
  const withCents = cleaned.match(/^([\d\s]+)(?:[,.](\d{2}))?$/)
  if (withCents) {
    const whole = withCents[1]!.replace(/[^\d]/g, '')
    if (!whole) return null
    return Number(whole)
  }
  const digits = cleaned.replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}

export function normalizePlnIntegerDigits(formatted: string): string {
  const n = parsePlnAmountInteger(formatted)
  return n == null ? '' : String(n)
}

export function extractPlnAmountSurfaces(text: string): string[] {
  const out: string[] = []
  const re = new RegExp(PLN_AMOUNT_SURFACE_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const s = m[0]!.replace(/\s+/g, ' ').trim()
    if (!isTrivialPlnAmountSurface(s)) out.push(s)
  }
  return out
}

export function extractPrimaryPlnAmount(text: string): string | null {
  const surfaces = extractPlnAmountSurfaces(text)
  return surfaces[0] ?? null
}

export function countPlnAmountSurfaces(text: string): number {
  return extractPlnAmountSurfaces(text).length
}

/**
 * True when text already carries a PLN surface whose złoty integer equals canonical.
 * Uses exact amount-surface parsing only (never digit-substring), so:
 * - `1 200 zł` does not satisfy canonical `11 200 zł`
 * - corrupted `11 211 200 zł` does not satisfy `11 200 zł`
 */
export function textHasCanonicalPlnAmount(
  text: string,
  formattedAmount: string,
): boolean {
  const target = normalizePlnIntegerDigits(formattedAmount)
  if (!target || target === '0') return false
  for (const surface of extractPlnAmountSurfaces(text)) {
    if (normalizePlnIntegerDigits(surface) === target) return true
  }
  return false
}

/**
 * Replace ONE semantic PLN amount surface whose integer digits differ from target.
 * Prefers the first non-canonical surface (exact-span, never cents-only).
 * Idempotent when already canonical.
 */
export function replacePlnAmountSurface(
  text: string,
  formattedAmount: string,
): string | null {
  const targetDigits = normalizePlnIntegerDigits(formattedAmount)
  if (!targetDigits) return null
  if (textHasCanonicalPlnAmount(text, formattedAmount)) {
    // Still may need to replace a different non-canonical surface in multi-amount blocks —
    // but if the only amounts are canonical, no-op.
    const surfaces = extractPlnAmountSurfaces(text)
    const nonCanon = surfaces.filter(
      (s) => normalizePlnIntegerDigits(s) !== targetDigits,
    )
    if (nonCanon.length === 0) return text
  }

  const re = new RegExp(PLN_AMOUNT_SURFACE_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const surface = m[0]!
    if (isTrivialPlnAmountSurface(surface)) continue
    const existing = normalizePlnIntegerDigits(surface)
    if (!existing || existing === targetDigits) continue
    return (
      text.slice(0, m.index) +
      formattedAmount +
      text.slice(m.index + surface.length)
    )
  }
  return null
}

/**
 * Replace PLN amount nearest a marker (deposit/remaining).
 * Replaces the full semantic surface after the marker — never cents-only.
 */
export function replacePlnAmountNearMarker(
  text: string,
  marker: RegExp,
  formattedAmount: string,
): string | null {
  if (!marker.test(text)) return null
  if (textHasCanonicalPlnAmount(text, formattedAmount)) return text
  const targetDigits = normalizePlnIntegerDigits(formattedAmount)
  if (!targetDigits) return null

  const re = new RegExp(
    `(${marker.source})([\\s\\S]{0,80}?)(${PLN_AMOUNT_SURFACE_RE_ONCE.source})`,
    'i',
  )
  const m = text.match(re)
  if (!m || m.index == null) return null
  const between = m[2] ?? ''
  const amountSurface = m[3] ?? ''
  if (isTrivialPlnAmountSurface(amountSurface)) return null
  const existingDigits = normalizePlnIntegerDigits(amountSurface)
  if (!existingDigits || existingDigits === targetDigits) return null
  // Another PLN amount between marker and target → ambiguous
  if (extractPlnAmountSurfaces(between).length > 0) return null
  return (
    text.slice(0, m.index) +
    m[1] +
    between +
    formattedAmount +
    text.slice(m.index + m[0].length)
  )
}
