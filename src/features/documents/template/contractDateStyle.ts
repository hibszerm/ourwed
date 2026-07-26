/**
 * Format contract dates like the source span style.
 * Always uses a space before „r.” in Polish prose (never ISO unless source is ISO).
 */

import { formatDateLikeSource } from '@/features/ai-contract-lab/resolveTypedSourceSpan'
import {
  formatDotDateFromIso,
  parseFlexibleDate,
} from '@/features/ai-contract-lab/semanticValueEquality'

const DATE_REGISTRY_KEYS = new Set([
  'wedding_date',
  'wedding_date_long',
  'final_payment_due_date',
  'final_payment_due_date_long',
  'payment_due_date',
  'contract_execution_date',
  'deposit_due_date',
  'delivery_deadline',
  'preview_deadline',
])

export function isDateRegistryKey(key: string): boolean {
  return DATE_REGISTRY_KEYS.has(key) || /_date$|_date_long$|deadline$/i.test(key)
}

/**
 * Format an ISO (or flexible) date for a physical slot, mirroring source style
 * but enforcing a space before „r.” when the source uses that abbreviation.
 */
export function formatContractDateForSlot(input: {
  isoOrValue: string
  sourceText: string
}): string {
  const raw = input.isoOrValue.trim()
  if (!raw) return ''

  const iso =
    parseFlexibleDate(raw) ??
    (/^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null)

  const source = input.sourceText.trim() || '01.01.2000 r.'

  // Prefer style-preserving formatter, then normalize „r.” spacing.
  if (iso) {
    let formatted = formatDateLikeSource({
      canonicalDate: iso,
      sourceText: source.includes('.') || /[a-ząćęłńóśźż]/i.test(source)
        ? source
        : `${formatDotDateFromIso(iso)} r.`,
    })
    formatted = ensureSpaceBeforeR(formatted)
    // Never emit bare ISO into Polish prose unless source was ISO.
    if (/^\d{4}-\d{2}-\d{2}/.test(formatted) && !/^\d{4}-\d{2}-\d{2}/.test(source)) {
      formatted = ensureSpaceBeforeR(`${formatDotDateFromIso(iso)} r.`)
    }
    return formatted
  }

  return ensureSpaceBeforeR(raw)
}

/** Enforce „2026 r.” not „2026r.” */
export function ensureSpaceBeforeR(value: string): string {
  return value.replace(/(\d)(r\.)/gi, '$1 $2').replace(/\s+r\./g, ' r.')
}

/** Default Polish short date with required space before r. */
export function formatPolishShortDateWithR(iso: string): string {
  const parsed = parseFlexibleDate(iso) ?? iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return iso
  return ensureSpaceBeforeR(`${formatDotDateFromIso(parsed)} r.`)
}
