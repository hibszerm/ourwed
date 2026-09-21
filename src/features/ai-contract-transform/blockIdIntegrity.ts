/**
 * CG4 — sparse changedBlocks blockId integrity helpers.
 *
 * Source block IDs are SYSTEM structure. Model-invented IDs must never mutate
 * the document. No fuzzy remapping to neighbors.
 */

import type { SparseChangedBlock } from './parseSparseV2Response'
import type { GroundedFinanceEvidence, GroundedFinanceEvidenceOutcome } from './types'
import { createHash } from 'node:crypto'

export type BlockIdPartition = {
  valid: SparseChangedBlock[]
  invalid: SparseChangedBlock[]
  validIdSet: Set<string>
  duplicates: SparseChangedBlock[]
}

export type DuplicateChangedBlockOccurrence = {
  blockId: string
  occurrenceIndex: number
  replacementLength: number
  fingerprint: string
  sourceExists: boolean
  protected?: boolean
  replacementEmpty: boolean
}

export type DuplicateChangedBlockDiagnostic = {
  blockId: string
  occurrenceCount: number
  duplicateClassification: 'IDENTICAL' | 'CONFLICTING'
  allFingerprintsEqual: boolean
  occurrences: DuplicateChangedBlockOccurrence[]
}

export function fingerprintChangedBlockText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Validate model semantic metadata against immutable source identity. */
export function validateGroundedFinanceEvidence(input: {
  financeEvidence: GroundedFinanceEvidence[]
  sourceBlockIds: readonly string[]
}): GroundedFinanceEvidence[] {
  return inspectGroundedFinanceEvidence(input).filter((item) => item.outcome === 'accepted')
    .map(({ outcome: _outcome, ...item }) => item)
}

export function inspectGroundedFinanceEvidence(input: {
  financeEvidence: GroundedFinanceEvidence[]
  sourceBlockIds: readonly string[]
}): GroundedFinanceEvidenceOutcome[] {
  const allowed = new Set(input.sourceBlockIds)
  const conceptsById = new Map<string, Set<string>>()
  const unknown: GroundedFinanceEvidenceOutcome[] = []
  for (const evidence of input.financeEvidence) {
    if (!allowed.has(evidence.sourceBlockId)) {
      unknown.push({ ...evidence, outcome: 'rejected_unknown_source' })
      continue
    }
    const concepts = conceptsById.get(evidence.sourceBlockId) ?? new Set<string>()
    concepts.add(evidence.financeConcept)
    conceptsById.set(evidence.sourceBlockId, concepts)
  }
  // Any conflicting claim for a source surface fails closed; identical duplicates coalesce.
  const results: GroundedFinanceEvidenceOutcome[] = [...conceptsById.entries()].flatMap<GroundedFinanceEvidenceOutcome>(([sourceBlockId, concepts]) =>
    concepts.size === 1
      ? [{ sourceBlockId, financeConcept: [...concepts][0]! as GroundedFinanceEvidence['financeConcept'], outcome: 'accepted' as const }]
      : [...concepts].map((financeConcept) => ({ sourceBlockId, financeConcept: financeConcept as GroundedFinanceEvidence['financeConcept'], outcome: 'rejected_contradiction' as const })),
  )
  return [...unknown, ...results]
}

export function partitionChangedBlocksBySourceIds(input: {
  changedBlocks: SparseChangedBlock[]
  sourceBlockIds: readonly string[]
}): BlockIdPartition {
  const validIdSet = new Set(input.sourceBlockIds)
  const valid: SparseChangedBlock[] = []
  const invalid: SparseChangedBlock[] = []
  const seen = new Set<string>()
  const duplicates: SparseChangedBlock[] = []

  for (const row of input.changedBlocks) {
    if (!row || typeof row.blockId !== 'string') {
      invalid.push(row)
      continue
    }
    // Duplicate IDs in the payload: keep first valid occurrence only
    if (seen.has(row.blockId)) {
      invalid.push(row)
      duplicates.push(row)
      continue
    }
    seen.add(row.blockId)
    if (validIdSet.has(row.blockId)) valid.push(row)
    else invalid.push(row)
  }

  return { valid, invalid, validIdSet, duplicates }
}

export function collectDuplicateChangedBlockDiagnostics(input: {
  changedBlocks: SparseChangedBlock[]
  sourceBlockIds: readonly string[]
  protectedBlockIds?: ReadonlySet<string>
}): DuplicateChangedBlockDiagnostic[] {
  const sourceIds = new Set(input.sourceBlockIds)
  const rows = new Map<string, SparseChangedBlock[]>()
  for (const row of input.changedBlocks) {
    if (!row || typeof row.blockId !== 'string') continue
    const list = rows.get(row.blockId) ?? []
    list.push(row)
    rows.set(row.blockId, list)
  }
  return [...rows.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([blockId, list]) => {
      const occurrences = list.map((row, occurrenceIndex) => ({
        blockId,
        occurrenceIndex,
        replacementLength: row.text.length,
        fingerprint: fingerprintChangedBlockText(row.text),
        sourceExists: sourceIds.has(blockId),
        ...(input.protectedBlockIds ? { protected: input.protectedBlockIds.has(blockId) } : {}),
        replacementEmpty: row.text.trim().length === 0,
      }))
      const fingerprints = occurrences.map((item) => item.fingerprint)
      const allFingerprintsEqual = fingerprints.every((value) => value === fingerprints[0])
      return {
        blockId,
        occurrenceCount: occurrences.length,
        duplicateClassification: allFingerprintsEqual ? 'IDENTICAL' : 'CONFLICTING',
        allFingerprintsEqual,
        occurrences,
      }
    })
}

export function buildProtocolBlockIdRetryHint(input: {
  invalidBlockIds: string[]
  allowedBlockIds: readonly string[]
}): string {
  const invalid = [...new Set(input.invalidBlockIds)].slice(0, 20).join(', ')
  const allowed = input.allowedBlockIds.slice(0, 80).join(', ')
  return [
    'PROTOCOL ERROR: one or more changedBlocks.blockId values are not in the source document.',
    `Rejected blockId(s): ${invalid || '(none)'}`,
    `Allowed blockId values (exact): ${allowed}`,
    'Return changedBlocks again using ONLY allowed blockId values. Do not invent IDs. Do not remap to neighboring numbers.',
  ].join('\n')
}

/**
 * Build strict JSON schema constraining blockId to the request's source IDs.
 * Falls back to unconstrained string when the ID set is empty.
 */
export function buildFullAiJsonSchemaForBlockIds(validBlockIds: readonly string[]) {
  const blockIdSchema =
    validBlockIds.length > 0
      ? { type: 'string' as const, enum: [...validBlockIds] }
      : { type: 'string' as const }

  return {
    name: 'full_ai_contract_rewrite_v2',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['changedBlocks', 'financeEvidence'],
      properties: {
        changedBlocks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['blockId', 'text'],
            properties: {
              blockId: blockIdSchema,
              // CG6.1: empty string is schema-invalid; whitespace still needs runtime trim check.
              text: { type: 'string', minLength: 1 },
            },
          },
        },
        financeEvidence: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['sourceBlockId', 'financeConcept'],
            properties: {
              sourceBlockId: blockIdSchema,
              financeConcept: { type: 'string', enum: ['total', 'deposit', 'remaining'] },
            },
          },
        },
      },
    },
  }
}
