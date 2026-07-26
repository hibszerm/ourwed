/**
 * Final patch safety gate for Phase B semantic rows.
 */

import type { SemanticStatus } from '@/features/ai-contract-lab/aiContractLabTypes'

export type SemanticPatchGateInput = {
  status: SemanticStatus | 'DOCUMENT_ONLY'
  exactValueSpanResolved: boolean
  sourceSpanIsValueOnly: boolean
  canonicalOrDerivedValueAvailable: boolean
  isLegalReference: boolean
  isDocumentOnly: boolean
  isCollectionLevelPlaceholder: boolean
  originalText: string
  replacementText: string
  /** Absolute date proposed into a relative-duration clause */
  absoluteIntoRelative?: boolean
  /** Monetary role without literal amount */
  monetaryWithoutLiteral?: boolean
}

export function canCreateSemanticPatch(row: SemanticPatchGateInput): boolean {
  if (row.status !== 'REPLACEMENT' && row.status !== 'DERIVED') return false
  if (!row.exactValueSpanResolved) return false
  if (!row.sourceSpanIsValueOnly) return false
  if (!row.canonicalOrDerivedValueAvailable) return false
  if (row.isLegalReference) return false
  if (row.isDocumentOnly) return false
  if (row.isCollectionLevelPlaceholder) return false
  if (row.absoluteIntoRelative) return false
  if (row.monetaryWithoutLiteral) return false
  if (row.originalText === row.replacementText) return false
  if (!row.replacementText.trim()) return false
  return true
}
