/**
 * Mode B — deterministic guarded verifier.
 */

import { computeTextEdits } from './blockDiffEngine'
import { classifyBlockDiff, isAllowedChange } from './changeClassifier'
import {
  hasPossibleLocationGrammarIssue,
  isIncompleteLocationAddress,
} from './locationInsertionPolicy'
import {
  findMissingProtectedValuesDetailed,
  fingerprintValue,
  isBlockProtectedByOwnership,
  type ProtectedContractDataWithProvenance,
} from './protectedContractData'
import type {
  ContractBlockDiff,
  ContractTransformationDataset,
  GuardedTransformationStatus,
  ModeBVerification,
  ProtectedContractData,
  TransformDocumentBlock,
  TransformedBlock,
} from './types'

export type ProtectedValueDiagnostic = {
  blockId: string
  canonicalField: string
  ownershipReason: string
  rowLabelText?: string
  sourceValueFingerprint: string
  targetValueFingerprint: string
}

export function verifyBlockStructure(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
}): { ok: boolean; issues: string[] } {
  const issues: string[] = []
  const srcIds = input.sourceBlocks.map((b) => b.blockId)
  const outIds = input.transformedBlocks.map((b) => b.blockId)

  if (outIds.length !== srcIds.length) {
    issues.push(
      `block_count_mismatch:source=${srcIds.length}:output=${outIds.length}`,
    )
  }

  const seen = new Set<string>()
  for (const id of outIds) {
    if (seen.has(id)) issues.push(`duplicate_block_id:${id}`)
    seen.add(id)
  }

  for (let i = 0; i < Math.min(srcIds.length, outIds.length); i++) {
    if (srcIds[i] !== outIds[i]) {
      issues.push(`block_order_mismatch_at:${i}`)
      break
    }
  }

  for (const id of srcIds) {
    if (!seen.has(id)) issues.push(`missing_block:${id}`)
  }
  for (const id of outIds) {
    if (!srcIds.includes(id)) issues.push(`added_block:${id}`)
  }

  return { ok: issues.length === 0, issues }
}

export function verifyGuardedTransformation(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  protectedData: ProtectedContractData | ProtectedContractDataWithProvenance
  approvedExceptions?: Record<string, boolean>
}): ModeBVerification & { protectedValueDiagnostics?: ProtectedValueDiagnostic[] } {
  const structure = verifyBlockStructure(input)
  const blockingIssues: string[] = [...structure.issues]
  const reviewIssues: string[] = []
  const diffs: ContractBlockDiff[] = []
  const protectedValueDiagnostics: ProtectedValueDiagnostic[] = []

  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b.text]))
  const fullTransformed = input.transformedBlocks.map((b) => b.text).join('\n')

  const missingProtected = findMissingProtectedValuesDetailed(
    input.protectedData as ProtectedContractDataWithProvenance,
    fullTransformed,
  )
  if (missingProtected.length > 0) {
    blockingIssues.push('protected_value_changed_or_removed')
  }
  for (const m of missingProtected) {
    blockingIssues.push(m.diagnosticCode)
    protectedValueDiagnostics.push({
      blockId: m.sourceBlockId,
      canonicalField: m.canonicalField,
      ownershipReason: m.ownershipReason,
      rowLabelText: m.rowLabelText,
      sourceValueFingerprint: m.sourceValueFingerprint,
      targetValueFingerprint: m.targetValueFingerprint,
    })
  }

  for (const src of input.sourceBlocks) {
    const transformed = byId.get(src.blockId)
    if (transformed === undefined) continue
    if (transformed === src.text) continue

    // Service scope / provider ownership: any change is protected unless exception
    if (isBlockProtectedByOwnership(src) && transformed !== src.text) {
      const family = src.tableContext?.ownershipFamily
      const canonicalField =
        family === 'service_scope'
          ? 'package.serviceScope'
          : 'provider.rowValue'
      const change = {
        sourceStart: 0,
        sourceEnd: src.text.length,
        sourceText: src.text,
        replacementText: transformed,
        classification: 'protected_value_change' as const,
        severity: 'blocking' as const,
        matchedDatasetField: canonicalField,
      }
      const diff: ContractBlockDiff = {
        blockId: src.blockId,
        paragraphIndex: src.paragraphIndex,
        sourceText: src.text,
        transformedText: transformed,
        changes: [change],
      }
      diffs.push(diff)
      blockingIssues.push(
        `protected_value_changed:${canonicalField}:${src.blockId}`,
      )
      protectedValueDiagnostics.push({
        blockId: src.blockId,
        canonicalField,
        ownershipReason:
          family === 'service_scope'
            ? 'service_scope_table_cell'
            : 'provider_row_value',
        rowLabelText: src.tableContext?.rowLabelText,
        sourceValueFingerprint: fingerprintValue(src.text),
        targetValueFingerprint: fingerprintValue(transformed),
      })
      continue
    }

    const rawEdits = computeTextEdits(src.text, transformed)
    const diff = classifyBlockDiff({
      sourceText: src.text,
      transformedText: transformed,
      blockId: src.blockId,
      paragraphIndex: src.paragraphIndex,
      dataset: input.dataset,
      protectedData: input.protectedData,
      mode: 'guarded',
      rawEdits,
      sourceBlock: src,
    })

    for (const change of diff.changes) {
      const key = `${diff.blockId}:${change.sourceStart}:${change.sourceEnd}:${change.classification}`
      if (input.approvedExceptions?.[key]) {
        change.exceptionApproved = true
        change.severity = 'info'
      }
    }

    diffs.push(diff)

    if (hasPossibleLocationGrammarIssue(transformed)) {
      const already = diff.changes.some(
        (c) => c.classification === 'possible_location_grammar_issue',
      )
      if (!already) {
        reviewIssues.push(`possible_location_grammar_issue:${diff.blockId}`)
      }
    }

    for (const key of ['preparation', 'ceremony', 'reception'] as const) {
      const loc = input.dataset.locations[key]
      const addr = loc?.fullAddress?.trim()
      if (addr && isIncompleteLocationAddress(addr) && transformed.includes(addr)) {
        reviewIssues.push(`incomplete_location_address:${key}:${diff.blockId}`)
      }
    }

    for (const change of diff.changes) {
      if (change.exceptionApproved) continue
      if (change.severity === 'blocking') {
        const code =
          change.classification === 'protected_value_change' &&
          change.matchedDatasetField
            ? `protected_value_changed:${change.matchedDatasetField}`
            : `${change.classification}:${diff.blockId}:${change.sourceStart}`
        blockingIssues.push(code)
        if (change.classification === 'protected_value_change') {
          protectedValueDiagnostics.push({
            blockId: diff.blockId,
            canonicalField: change.matchedDatasetField ?? 'provider.unknown',
            ownershipReason: 'classifier_protected_match',
            rowLabelText: src.tableContext?.rowLabelText,
            sourceValueFingerprint: fingerprintValue(change.sourceText),
            targetValueFingerprint: fingerprintValue(change.replacementText),
          })
        }
      } else if (
        change.severity === 'warning' ||
        (!isAllowedChange(change) && change.severity !== 'info')
      ) {
        reviewIssues.push(
          `${change.classification}:${diff.blockId}:${change.sourceStart}`,
        )
      }
    }
  }

  let expectedChangeCount = 0
  let unexpectedChangeCount = 0
  let protectedChangeCount = 0
  let structureChangeCount = structure.issues.length

  for (const d of diffs) {
    for (const c of d.changes) {
      if (c.exceptionApproved || isAllowedChange(c)) expectedChangeCount += 1
      else if (c.classification === 'protected_value_change') {
        protectedChangeCount += 1
        unexpectedChangeCount += 1
      } else if (c.classification === 'block_structure_change') {
        structureChangeCount += 1
        unexpectedChangeCount += 1
      } else unexpectedChangeCount += 1
    }
  }

  let status: GuardedTransformationStatus
  if (blockingIssues.length > 0 || !structure.ok) status = 'blocked'
  else if (reviewIssues.length > 0) status = 'review_required'
  else status = 'safe_to_generate'

  return {
    status,
    structureOk: structure.ok,
    blockingIssues,
    reviewIssues,
    diffs,
    expectedChangeCount,
    unexpectedChangeCount,
    protectedChangeCount,
    structureChangeCount,
    protectedValueDiagnostics,
  }
}
