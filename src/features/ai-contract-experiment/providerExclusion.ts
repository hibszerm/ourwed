/**
 * Span-level provider / immutable exclusion with DEV diagnostics.
 */

import { isBankAccountExactValue } from './bankAccountDetector'
import { classifyDocumentBlock } from './documentBlockClassification'
import { protectedRangesForBlock } from './protectedDocumentRanges'
import type { DocumentBlockPartyClassification } from './documentBlockClassification'
import type { ProtectedDocumentRange } from './protectedDocumentRanges'
import type {
  ContractFieldKey,
  IndexedDocxBlock,
  StructuredAiMappingResponse,
} from './types'
import { devInfoArgs } from '@/lib/debug/devConsole'

const CLIENT_DYNAMIC_FIELDS = new Set<ContractFieldKey>([
  'couple_full_names',
  'client_address',
  'client_phone',
  'contract_execution_date',
  'wedding_date',
  'preparation_location',
  'ceremony_location',
  'reception_location',
  'contract_value_formatted',
  'contract_value_words',
  'agreed_deposit_formatted',
  'remaining_after_deposit_formatted',
  'deposit_due_date',
  'payment_due_date',
  'final_payment_due_date',
])

const PROVIDER_RANGE_CLASSIFICATIONS = new Set<ProtectedDocumentRange['classification']>([
  'provider_identity',
  'provider_address',
  'provider_nip',
  'provider_regon',
  'provider_phone',
  'provider_bank_account',
])

const IMMUTABLE_RANGE_CLASSIFICATIONS = new Set<ProtectedDocumentRange['classification']>([
  'package_fact',
  'legal_clause',
  'immutable_payment_prose',
])

export type ProviderExclusionTrace = {
  fieldKey: ContractFieldKey
  blockId: string
  blockClassification: DocumentBlockPartyClassification
  exactValue: string
  resolvedRange: { start: number; end: number }
  protectedRanges: Array<{
    classification: ProtectedDocumentRange['classification']
    start: number
    end: number
    sourceText: string
  }>
  overlapsProtectedRange: boolean
  decision: 'allow' | 'reject'
  reason: string | null
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end
}

function logProviderExclusionTrace(trace: ProviderExclusionTrace): void {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    devInfoArgs('[ai-mapping-provider-exclusion-trace]', trace)
  }
}

function isProviderIdentifierSpan(exactValue: string): boolean {
  if (isBankAccountExactValue(exactValue)) return true
  if (/^NIP[:\s]*\d/i.test(exactValue)) return true
  if (/^REGON[:\s]*\d/i.test(exactValue)) return true
  if (/^(?:tel\.|telefon:)/i.test(exactValue) && /\d{7,}/.test(exactValue)) {
    return true
  }
  return false
}

export function getBlockProtectionContext(input: {
  block: IndexedDocxBlock
  immutableFindings?: StructuredAiMappingResponse['immutableFindings']
}): {
  classification: DocumentBlockPartyClassification
  protectedRanges: ProtectedDocumentRange[]
} {
  const protectedRanges = protectedRangesForBlock({
    blockId: input.block.id,
    text: input.block.text,
    immutableFindings: input.immutableFindings,
  })
  const classification = classifyDocumentBlock({
    block: input.block,
    protectedRanges,
  })
  return { classification, protectedRanges }
}

export function validateSpanProviderExclusion(input: {
  fieldKey: ContractFieldKey
  block: IndexedDocxBlock
  exactValue: string
  start: number
  end: number
  immutableFindings?: StructuredAiMappingResponse['immutableFindings']
}): { ok: true; trace: ProviderExclusionTrace } | { ok: false; reason: string; trace: ProviderExclusionTrace } {
  const { classification, protectedRanges } = getBlockProtectionContext({
    block: input.block,
    immutableFindings: input.immutableFindings,
  })

  const span = { start: input.start, end: input.end }
  const overlapping = protectedRanges.filter((r) => rangesOverlap(span, r))

  const baseTrace: ProviderExclusionTrace = {
    fieldKey: input.fieldKey,
    blockId: input.block.id,
    blockClassification: classification,
    exactValue: input.exactValue,
    resolvedRange: span,
    protectedRanges: protectedRanges.map((r) => ({
      classification: r.classification,
      start: r.start,
      end: r.end,
      sourceText: r.sourceText,
    })),
    overlapsProtectedRange: overlapping.length > 0,
    decision: 'allow',
    reason: null,
  }

  if (
    classification === 'provider_only' &&
    CLIENT_DYNAMIC_FIELDS.has(input.fieldKey)
  ) {
    const trace = {
      ...baseTrace,
      decision: 'reject' as const,
      reason: 'provider_only_block',
    }
    logProviderExclusionTrace(trace)
    return { ok: false, reason: 'provider_only_block', trace }
  }

  if (isProviderIdentifierSpan(input.exactValue)) {
    const trace = {
      ...baseTrace,
      decision: 'reject' as const,
      reason: 'provider_value_mapped_as_client_field',
    }
    logProviderExclusionTrace(trace)
    return {
      ok: false,
      reason: 'provider_value_mapped_as_client_field',
      trace,
    }
  }

  const providerOverlap = overlapping.find((r) =>
    PROVIDER_RANGE_CLASSIFICATIONS.has(r.classification),
  )
  if (providerOverlap) {
    const trace = {
      ...baseTrace,
      decision: 'reject' as const,
      reason: 'overlap_with_provider_protected_range',
    }
    logProviderExclusionTrace(trace)
    return {
      ok: false,
      reason: 'overlap_with_provider_protected_range',
      trace,
    }
  }

  const immutableOverlap = overlapping.find((r) =>
    IMMUTABLE_RANGE_CLASSIFICATIONS.has(r.classification),
  )
  if (immutableOverlap) {
    const trace = {
      ...baseTrace,
      decision: 'reject' as const,
      reason: 'overlap_with_immutable_range',
    }
    logProviderExclusionTrace(trace)
    return {
      ok: false,
      reason: 'overlap_with_immutable_range',
      trace,
    }
  }

  logProviderExclusionTrace(baseTrace)
  return { ok: true, trace: baseTrace }
}
