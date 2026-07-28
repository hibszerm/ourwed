/**
 * Evidence and rawValue sanitizers for recovery extraction.
 * Deterministic post-AI cleanup — does not invent content.
 */

import type { ExtractionEvidence, ExtractedField } from './types'

export const MAX_EVIDENCE_QUOTE_CHARS = 160
export const MAX_EVIDENCE_ITEMS_SCALAR = 1
export const MAX_EVIDENCE_ITEMS_COMPLEX = 2

const COMPLEX_FIELD_PATHS = new Set([
  'originalDescription',
  'paymentTermsText',
  'deliveryTerms',
  'cancellationTerms',
  'notesRelevantToExecution',
])

export function normalizeEvidenceQuoteForCompare(quote: string): string {
  return quote
    .replace(/[„”""«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function sanitizeEvidenceQuote(
  quote: string,
  maxChars = MAX_EVIDENCE_QUOTE_CHARS,
): string {
  let text = quote.replace(/\s+/g, ' ').trim()
  if (text.length <= maxChars) return text

  // Prefer cutting at a word boundary without dropping the whole quote
  const slice = text.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice
  return `${cut.trimEnd()}…`
}

export function sanitizeEvidenceArray(
  evidence: ExtractionEvidence[],
  options?: { maxItems?: number; maxQuoteChars?: number },
): ExtractionEvidence[] {
  const maxItems = options?.maxItems ?? MAX_EVIDENCE_ITEMS_SCALAR
  const maxQuoteChars = options?.maxQuoteChars ?? MAX_EVIDENCE_QUOTE_CHARS
  const out: ExtractionEvidence[] = []
  const seen = new Set<string>()

  for (const item of evidence) {
    if (out.length >= maxItems) break
    const quote = sanitizeEvidenceQuote(item.quote ?? '', maxQuoteChars)
    if (!quote) continue
    const key = normalizeEvidenceQuoteForCompare(quote)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      quote,
      page: item.page ?? null,
      section: item.section ?? null,
    })
  }

  return out
}

export function comparableRawValue(value: string | number | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return String(value)
  }
  const cleaned = value.replace(/\s+/g, ' ').trim().toLowerCase()
  return cleaned || null
}

/**
 * Keep rawValue only when it materially differs from normalized value.
 */
export function coalesceRedundantRawValue<T extends string | number>(
  field: ExtractedField<T>,
): ExtractedField<T> {
  const raw = field.rawValue ?? null
  if (raw == null || field.value == null) {
    return { ...field, rawValue: raw }
  }

  const left = comparableRawValue(raw)
  const right = comparableRawValue(field.value)
  if (left != null && right != null && left === right) {
    return { ...field, rawValue: null }
  }

  return { ...field, rawValue: raw }
}

export function isComplexFieldKey(key: string): boolean {
  return COMPLEX_FIELD_PATHS.has(key)
}
