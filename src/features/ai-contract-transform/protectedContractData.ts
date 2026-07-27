/**
 * Deterministic protected-values extraction with table-aware ownership.
 * Never log exact protected values from callers.
 */

import {
  classifyRowLabel,
  type TableCellContext,
  type TableRowOwnershipFamily,
} from './tableRowOwnership'
import type { ProtectedContractData, ProtectedPattern, TransformDocumentBlock } from './types'

const NIP_RE = /\b(?:NIP[:\s]*)?(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}|\d{10})\b/gi
const REGON_RE = /\b(?:REGON[:\s]*)?(\d{9}|\d{14})\b/gi
const IBAN_PL =
  /\b(?:PL)?[\s]?(\d{2}(?:[\s-]?\d{4}){6})\b/gi
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_RE =
  /\b(?:tel\.?\s*)?((?:\+48[\s-]?)?(?:\d{3}[\s-]?\d{3}[\s-]?\d{3}|\d{9}))\b/gi

export type ProtectedValueProvenance = {
  canonicalField: string
  sourceBlockId: string
  sourceSpan: string
  ownershipReason: string
  tableContext?: TableCellContext
  /** Short fingerprint for diagnostics — not the raw value. */
  valueFingerprint: string
}

export type ProtectedContractDataWithProvenance = ProtectedContractData & {
  entries: ProtectedValueProvenance[]
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v.trim().replace(/\s+/g, ' ')
    if (!t || t.length < 3) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

function collectMatches(text: string, re: RegExp): string[] {
  const out: string[] = []
  const copy = new RegExp(re.source, re.flags)
  let m: RegExpExecArray | null
  while ((m = copy.exec(text))) {
    out.push(m[1] ?? m[0]!)
  }
  return out
}

/** Stable short fingerprint — no reverse of private data. */
export function fingerprintValue(value: string): string {
  const compact = value.replace(/\s+/g, '')
  let hash = 0
  for (let i = 0; i < compact.length; i++) {
    hash = (hash * 31 + compact.charCodeAt(i)) >>> 0
  }
  return `len${compact.length}:${hash.toString(16)}`
}

function ownershipAllowsProtection(
  family: TableRowOwnershipFamily | undefined,
): boolean {
  // Only provider / service_scope / unknown body text may contribute protection
  // Customer / wedding rows must never seed protected values.
  if (family === 'customer') return false
  if (family === 'wedding_date') return false
  if (family === 'wedding_location') return false
  return true
}

function blockOwnershipFamily(
  block: TransformDocumentBlock,
): TableRowOwnershipFamily | undefined {
  return block.tableContext?.ownershipFamily
}

function pushEntry(
  entries: ProtectedValueProvenance[],
  exact: string[],
  input: {
    value: string
    canonicalField: string
    sourceBlockId: string
    ownershipReason: string
    tableContext?: TableCellContext
  },
) {
  const value = input.value.trim().replace(/\s+/g, ' ')
  if (!value || value.length < 3) return
  exact.push(value)
  entries.push({
    canonicalField: input.canonicalField,
    sourceBlockId: input.sourceBlockId,
    sourceSpan: value,
    ownershipReason: input.ownershipReason,
    tableContext: input.tableContext,
    valueFingerprint: fingerprintValue(value),
  })
}

/**
 * Build protected data from document blocks + optional known provider strings.
 * Table ownership is row-local: customer rows never contribute protected values.
 */
export function buildProtectedContractData(input: {
  blockTexts?: string[]
  blocks?: TransformDocumentBlock[]
  knownProviderValues?: string[]
}): ProtectedContractDataWithProvenance {
  const blocks = input.blocks ?? []
  const exact: string[] = []
  const entries: ProtectedValueProvenance[] = []

  for (const known of input.knownProviderValues ?? []) {
    pushEntry(entries, exact, {
      value: known,
      canonicalField: 'provider.name',
      sourceBlockId: 'known_provider',
      ownershipReason: 'known_provider_value',
    })
  }

  const candidateBlocks: TransformDocumentBlock[] =
    blocks.length > 0
      ? blocks
      : (input.blockTexts ?? []).map((text, i) => ({
          blockId: `para-${i}`,
          paragraphIndex: i,
          text,
          kind: 'paragraph' as const,
        }))

  for (const block of candidateBlocks) {
    const family = blockOwnershipFamily(block)
    if (!ownershipAllowsProtection(family)) continue

    const text = block.text
    const ctx = block.tableContext

    for (const nip of collectMatches(text, NIP_RE)) {
      pushEntry(entries, exact, {
        value: nip,
        canonicalField: 'provider.taxId',
        sourceBlockId: block.blockId,
        ownershipReason:
          family === 'provider'
            ? 'provider_row_nip'
            : 'provider_context_nip',
        tableContext: ctx,
      })
    }
    for (const regon of collectMatches(text, REGON_RE)) {
      pushEntry(entries, exact, {
        value: regon,
        canonicalField: 'provider.regon',
        sourceBlockId: block.blockId,
        ownershipReason:
          family === 'provider'
            ? 'provider_row_regon'
            : 'provider_context_regon',
        tableContext: ctx,
      })
    }
    for (const iban of collectMatches(text, IBAN_PL)) {
      pushEntry(entries, exact, {
        value: iban,
        canonicalField: 'provider.bankAccount',
        sourceBlockId: block.blockId,
        ownershipReason: 'bank_account',
        tableContext: ctx,
      })
    }
    for (const email of collectMatches(text, EMAIL_RE)) {
      // Emails only from provider rows / known body — not customer rows
      if (family === 'provider' || family === undefined || family === 'unknown') {
        if (family === 'unknown' && block.kind === 'tableCell') continue
        pushEntry(entries, exact, {
          value: email,
          canonicalField: 'provider.email',
          sourceBlockId: block.blockId,
          ownershipReason:
            family === 'provider' ? 'provider_row_email' : 'body_email',
          tableContext: ctx,
        })
      }
    }
    for (const phone of collectMatches(text, PHONE_RE)) {
      if (family === 'provider') {
        pushEntry(entries, exact, {
          value: phone,
          canonicalField: 'provider.phone',
          sourceBlockId: block.blockId,
          ownershipReason: 'provider_row_phone',
          tableContext: ctx,
        })
      } else if (
        (family === undefined || family === 'unknown') &&
        block.kind === 'paragraph' &&
        /\b(?:Wykonawc|Usługodawc|Studio|NIP)\b/i.test(text)
      ) {
        pushEntry(entries, exact, {
          value: phone,
          canonicalField: 'provider.phone',
          sourceBlockId: block.blockId,
          ownershipReason: 'provider_paragraph_phone',
          tableContext: ctx,
        })
      }
    }

    // Service scope cells: protect full cell text (durations, Tak/Nie, deliverable names)
    if (family === 'service_scope' && block.text.trim().length >= 2) {
      pushEntry(entries, exact, {
        value: block.text,
        canonicalField: 'package.serviceScope',
        sourceBlockId: block.blockId,
        ownershipReason: 'service_scope_table_cell',
        tableContext: ctx,
      })
    }
  }

  // Body paragraphs: still collect NIP/REGON/IBAN even without blocks metadata
  if (blocks.length === 0 && input.blockTexts) {
    const joined = input.blockTexts.join('\n')
    for (const nip of collectMatches(joined, NIP_RE)) {
      pushEntry(entries, exact, {
        value: nip,
        canonicalField: 'provider.taxId',
        sourceBlockId: 'document',
        ownershipReason: 'document_nip',
      })
    }
    for (const regon of collectMatches(joined, REGON_RE)) {
      pushEntry(entries, exact, {
        value: regon,
        canonicalField: 'provider.regon',
        sourceBlockId: 'document',
        ownershipReason: 'document_regon',
      })
    }
    for (const iban of collectMatches(joined, IBAN_PL)) {
      pushEntry(entries, exact, {
        value: iban,
        canonicalField: 'provider.bankAccount',
        sourceBlockId: 'document',
        ownershipReason: 'document_bank',
      })
    }
  }

  const patterns: ProtectedPattern[] = [
    { kind: 'nip', patternSource: 'nip_digits' },
    { kind: 'regon', patternSource: 'regon_digits' },
    { kind: 'bank_account', patternSource: 'iban_pl' },
    { kind: 'email', patternSource: 'email' },
    { kind: 'phone', patternSource: 'provider_phone_context' },
  ]

  return {
    exactProtectedValues: uniqueNonEmpty(exact),
    protectedPatterns: patterns,
    entries,
  }
}

export function protectedDataSummary(data: ProtectedContractData): {
  exactCount: number
  patternCount: number
} {
  return {
    exactCount: data.exactProtectedValues.length,
    patternCount: data.protectedPatterns.length,
  }
}

export type MissingProtectedValue = {
  canonicalField: string
  ownershipReason: string
  sourceBlockId: string
  sourceValueFingerprint: string
  targetValueFingerprint: string
  rowLabelText?: string
  diagnosticCode: string
}

export function findMissingProtectedValuesDetailed(
  source: ProtectedContractDataWithProvenance | ProtectedContractData,
  transformedText: string,
): MissingProtectedValue[] {
  const entries: ProtectedValueProvenance[] =
    'entries' in source && Array.isArray(source.entries)
      ? source.entries
      : source.exactProtectedValues.map((value) => ({
          canonicalField: 'provider.unknown',
          sourceBlockId: 'document',
          sourceSpan: value,
          ownershipReason: 'legacy_exact',
          valueFingerprint: fingerprintValue(value),
        } satisfies ProtectedValueProvenance))

  const missing: MissingProtectedValue[] = []
  const transformedCompact = transformedText.replace(/\s+/g, '')
  for (const entry of entries) {
    const value = entry.sourceSpan
    if (transformedText.includes(value)) continue
    const compact = value.replace(/\s+/g, '')
    if (transformedCompact.includes(compact)) continue
    missing.push({
      canonicalField: entry.canonicalField,
      ownershipReason: entry.ownershipReason,
      sourceBlockId: entry.sourceBlockId,
      sourceValueFingerprint: entry.valueFingerprint,
      targetValueFingerprint: fingerprintValue(''),
      rowLabelText: entry.tableContext?.rowLabelText,
      diagnosticCode: `protected_value_removed:${entry.canonicalField}`,
    })
  }
  return missing
}

/** Back-compat: return source spans that are missing. */
export function findMissingProtectedValues(
  source: ProtectedContractData,
  transformedText: string,
): string[] {
  if ('entries' in source && Array.isArray((source as ProtectedContractDataWithProvenance).entries)) {
    return findMissingProtectedValuesDetailed(
      source as ProtectedContractDataWithProvenance,
      transformedText,
    ).map((m) => m.diagnosticCode)
  }
  const missing: string[] = []
  for (const value of source.exactProtectedValues) {
    if (!transformedText.includes(value)) {
      const compact = value.replace(/\s+/g, '')
      const transformedCompact = transformedText.replace(/\s+/g, '')
      if (!transformedCompact.includes(compact)) {
        missing.push(value)
      }
    }
  }
  return missing
}

export function isBlockReplaceableByOwnership(
  block: TransformDocumentBlock,
): boolean {
  const family = block.tableContext?.ownershipFamily
  if (!family) return true
  return (
    family === 'customer' ||
    family === 'wedding_date' ||
    family === 'wedding_location' ||
    family === 'unknown'
  )
}

export function isBlockProtectedByOwnership(block: TransformDocumentBlock): boolean {
  const family = block.tableContext?.ownershipFamily
  return family === 'provider' || family === 'service_scope'
}

export { classifyRowLabel }
