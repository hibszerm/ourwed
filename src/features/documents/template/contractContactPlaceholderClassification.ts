/**
 * Contact placeholder classification — physical spans for empty/masked phone & email.
 * Does not invent wedding contact values; spans are replace targets only.
 */

import { devInfoArgs } from '@/lib/debug/devConsole'
export type ContactPlaceholderType =
  | 'underscore_placeholder'
  | 'dot_placeholder'
  | 'dash_placeholder'
  | 'blank_after_label'
  | 'blank_table_cell'
  | 'masked_phone'
  | 'masked_email'
  | 'literal_placeholder_text'
  | 'obfuscated_spaced'
  | 'absent_no_span'

export type ContactCanonicalKey =
  | 'bride_phone'
  | 'bride_email'
  | 'groom_phone'
  | 'groom_email'

export interface ContactPlaceholderCandidate {
  labelText: string
  placeholderText: string
  placeholderType: ContactPlaceholderType
  partyRole: 'partner1' | 'partner2' | 'provider' | 'unknown'
  canonicalKey: ContactCanonicalKey | null
  paragraphIndex: number
  tableIndex: number | null
  rowIndex: number | null
  cellIndex: number | null
  startOffset: number | null
  endOffset: number | null
  insertionAnchor: string | null
  physicalSpanSafety: 'safe' | 'unsafe' | 'needs_review'
  confidence: number
  reviewState: 'ok' | 'needs_review' | 'excluded'
  rejectionReason: string | null
  resolverAvailable: boolean
}

const PHONE_KEYS = new Set(['bride_phone', 'groom_phone'])
const EMAIL_KEYS = new Set(['bride_email', 'groom_email'])

export function isContactRegistryKey(key: string): boolean {
  return (
    PHONE_KEYS.has(key) ||
    EMAIL_KEYS.has(key) ||
    key === 'partner1_phone' ||
    key === 'partner1_email' ||
    key === 'partner2_phone' ||
    key === 'partner2_email'
  )
}

export function classifyPlaceholderType(
  raw: string,
  kind: 'phone' | 'email',
): ContactPlaceholderType {
  const v = raw.trim()
  if (!v) return 'blank_after_label'
  if (/^_{3,}$/.test(v) || /_{4,}/.test(v)) return 'underscore_placeholder'
  if (/^\.{3,}$/.test(v) || /^\u2026{2,}/.test(v)) return 'dot_placeholder'
  if (/^-{3,}$/.test(v) || /^–{3,}$/.test(v) || /^—{3,}$/.test(v)) {
    return 'dash_placeholder'
  }
  if (/^\[.*(telefon|phone|email|e-?mail|numer).*\]$/i.test(v)) {
    return 'literal_placeholder_text'
  }
  if (/^(brak|n\/a|brak danych)$/i.test(v)) return 'literal_placeholder_text'
  if (kind === 'phone' && /^[xX\d+\s\-–—.]{7,}$/.test(v) && /x/i.test(v)) {
    return 'masked_phone'
  }
  if (kind === 'email' && /@/.test(v) && /x{2,}|\*{2,}|\.{2,}|…/i.test(v)) {
    return 'masked_email'
  }
  if ((v.match(/[.\u2026…·•]/g) ?? []).length >= 3) return 'obfuscated_spaced'
  if (/^[.\u2026…_\-\s]{4,}$/u.test(v)) return 'dot_placeholder'
  return kind === 'phone' ? 'masked_phone' : 'masked_email'
}

/** True when the span is a replaceable placeholder (not a real contact value). */
export function isContactPlaceholderValue(
  raw: string,
  kind: 'phone' | 'email',
): boolean {
  const v = raw.trim()
  if (!v) return true
  const type = classifyPlaceholderType(v, kind)
  if (type === 'absent_no_span') return true
  if (
    type === 'underscore_placeholder' ||
    type === 'dot_placeholder' ||
    type === 'dash_placeholder' ||
    type === 'literal_placeholder_text' ||
    type === 'blank_after_label' ||
    type === 'obfuscated_spaced' ||
    type === 'masked_phone' ||
    type === 'masked_email'
  ) {
    return true
  }
  if (kind === 'phone') {
    const digits = v.replace(/[^\d]/g, '')
    return digits.length < 9
  }
  // email: real addresses have @ and a domain without heavy obfuscation
  if (!/@/.test(v)) return true
  if ((v.match(/[.\u2026…·•]/g) ?? []).length >= 3) return true
  return false
}

export function logContactPlaceholder(
  candidate: ContactPlaceholderCandidate,
): void {
  devInfoArgs('[contract-contact-placeholder-classification]', {
    labelText: candidate.labelText,
    placeholderText: candidate.placeholderText.slice(0, 80),
    placeholderType: candidate.placeholderType,
    partyRole: candidate.partyRole,
    canonicalKey: candidate.canonicalKey,
    paragraphIndex: candidate.paragraphIndex,
    tableIndex: candidate.tableIndex,
    rowIndex: candidate.rowIndex,
    cellIndex: candidate.cellIndex,
    startOffset: candidate.startOffset,
    endOffset: candidate.endOffset,
    insertionAnchor: candidate.insertionAnchor,
    physicalSpanSafety: candidate.physicalSpanSafety,
    confidence: candidate.confidence,
    reviewState: candidate.reviewState,
    rejectionReason: candidate.rejectionReason,
    resolverAvailable: candidate.resolverAvailable,
  })
}
