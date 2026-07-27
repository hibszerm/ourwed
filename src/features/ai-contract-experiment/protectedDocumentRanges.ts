/**
 * Smallest provable protected physical ranges inside a block.
 * AI immutableFindings are hints only — never whole-block locks on mixed paragraphs.
 */

import { extractBankAccountRanges } from './bankAccountDetector'
import type { StructuredAiMappingResponse } from './types'

export type ProtectedDocumentRange = {
  blockId: string
  start: number
  end: number
  classification:
    | 'provider_identity'
    | 'provider_address'
    | 'provider_nip'
    | 'provider_regon'
    | 'provider_phone'
    | 'provider_bank_account'
    | 'package_fact'
    | 'legal_clause'
    | 'immutable_payment_prose'
  sourceText: string
}

const NIP_RE = /\bNIP[:\s]*(\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\d{10})\b/gi
const REGON_RE = /\bREGON[:\s]*(\d{9}(?:\d{5})?)\b/gi
const PROVIDER_PHONE_RE =
  /\b(?:tel\.|telefon)[:\s]*(?:\+48[\s-]?)?(?:\d[\s-]?){8,9}\d\b/gi

const IMMUTABLE_PAYMENT_PROSE = [
  /płatne\s+jednorazowo,\s+przelewem\s+na\s+rachunek\s+Wykonawcy\s+nr/gi,
  /najpóźniej\s+w\s+terminie\s+\d+\s+dni\s+przed\s+datą\s+wydarzenia/gi,
  /przelewem\s+na\s+rachunek\s+Wykonawcy/gi,
] as const

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function mergeRange(
  ranges: ProtectedDocumentRange[],
  next: ProtectedDocumentRange,
): void {
  const overlap = ranges.find(
    (r) =>
      r.classification === next.classification &&
      rangesOverlap(r, next),
  )
  if (!overlap) {
    ranges.push(next)
    return
  }
  const start = Math.min(overlap.start, next.start)
  const end = Math.max(overlap.end, next.end)
  overlap.start = start
  overlap.end = end
  overlap.sourceText = overlap.sourceText.slice(
    0,
    Math.max(0, next.start - overlap.start),
  )
}

function addRegexMatches(input: {
  blockId: string
  text: string
  re: RegExp
  classification: ProtectedDocumentRange['classification']
  groupIndex?: number
  ranges: ProtectedDocumentRange[]
}): void {
  const re = new RegExp(input.re.source, input.re.flags)
  for (const match of input.text.matchAll(re)) {
    const captured = input.groupIndex != null ? match[input.groupIndex] : match[0]
    if (!captured) continue
    const start =
      (match.index ?? 0) +
      (match[0]!.indexOf(captured) >= 0 ? match[0]!.indexOf(captured) : 0)
    mergeRange(input.ranges, {
      blockId: input.blockId,
      start,
      end: start + captured.length,
      classification: input.classification,
      sourceText: captured,
    })
  }
}

function findingToClassification(
  classification: StructuredAiMappingResponse['immutableFindings'][number]['classification'],
): ProtectedDocumentRange['classification'] | null {
  switch (classification) {
    case 'provider_data':
      return 'provider_identity'
    case 'bank_account':
      return 'provider_bank_account'
    case 'package_fact':
      return 'package_fact'
    case 'legal_clause':
      return 'legal_clause'
    case 'delivery_fact':
      return 'package_fact'
    default:
      return null
  }
}

export function protectedRangesForBlock(input: {
  blockId: string
  text: string
  immutableFindings?: StructuredAiMappingResponse['immutableFindings']
}): ProtectedDocumentRange[] {
  const ranges: ProtectedDocumentRange[] = []

  for (const account of extractBankAccountRanges(input.text)) {
    mergeRange(ranges, {
      blockId: input.blockId,
      start: account.start,
      end: account.end,
      classification: 'provider_bank_account',
      sourceText: account.sourceText,
    })
  }

  addRegexMatches({
    blockId: input.blockId,
    text: input.text,
    re: NIP_RE,
    classification: 'provider_nip',
    groupIndex: 1,
    ranges,
  })
  addRegexMatches({
    blockId: input.blockId,
    text: input.text,
    re: REGON_RE,
    classification: 'provider_regon',
    groupIndex: 1,
    ranges,
  })

  const isProviderDominantBlock =
    /Wykonawc|Usługodawc|NIP|REGON|rachunek|IBAN/i.test(input.text) &&
    !/Zamawiaj|Klient|Narzecz|zam\./i.test(input.text)

  if (isProviderDominantBlock) {
    addRegexMatches({
      blockId: input.blockId,
      text: input.text,
      re: PROVIDER_PHONE_RE,
      classification: 'provider_phone',
      ranges,
    })
  }

  for (const re of IMMUTABLE_PAYMENT_PROSE) {
    const pattern = new RegExp(re.source, re.flags)
    for (const match of input.text.matchAll(pattern)) {
      const sourceText = match[0]!
      const start = match.index ?? input.text.indexOf(sourceText)
      mergeRange(ranges, {
        blockId: input.blockId,
        start,
        end: start + sourceText.length,
        classification: 'immutable_payment_prose',
        sourceText,
      })
    }
  }

  for (const finding of input.immutableFindings ?? []) {
    if (finding.blockId !== input.blockId) continue
    const mapped = findingToClassification(finding.classification)
    if (!mapped) continue

    const sourceText = finding.sourceText.trim()
    if (!sourceText) continue

    // Never lock the whole mixed paragraph from an overbroad AI finding.
    if (sourceText.length >= input.text.length * 0.85) continue
    if (!input.text.includes(sourceText)) continue

    const start = input.text.indexOf(sourceText)
    mergeRange(ranges, {
      blockId: input.blockId,
      start,
      end: start + sourceText.length,
      classification: mapped,
      sourceText,
    })
  }

  return ranges.sort((a, b) => a.start - b.start)
}
