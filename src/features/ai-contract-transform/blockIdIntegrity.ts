/**
 * CG4 — sparse changedBlocks blockId integrity helpers.
 *
 * Source block IDs are SYSTEM structure. Model-invented IDs must never mutate
 * the document. No fuzzy remapping to neighbors.
 */

import type { SparseChangedBlock } from './parseSparseV2Response'
import type { GroundedDateEvidence, GroundedDateEvidenceOutcome, GroundedFinanceEvidence, GroundedFinanceEvidenceOutcome, TransformDocumentBlock } from './types'
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

const DATE_VALUE_RE = /(?:\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s*r\.)?\b|\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}(?:\s*r\.)?\b)/i

/** Ground semantic date roles only to source date values (never to model text). */
export function inspectGroundedDateEvidence(input: {
  dateEvidence: GroundedDateEvidence[]
  sourceBlocks: readonly TransformDocumentBlock[]
}): GroundedDateEvidenceOutcome[] {
  const sourceById = new Map(input.sourceBlocks.map((block) => [block.blockId, block]))
  const grouped = new Map<string, Set<GroundedDateEvidence['dateConcept']>>()
  const outcomes: GroundedDateEvidenceOutcome[] = []

  for (const item of input.dateEvidence) {
    const source = sourceById.get(item.sourceBlockId)
    if (!source) {
      outcomes.push({ ...item, outcome: 'rejected_unknown_source', rejectionReason: 'source_block_not_found', evidenceSource: 'model_semantic' })
      continue
    }
    // The semantic claim must point at a date-bearing value, or a structurally
    // positioned empty table value cell. The model—not a lexical router—assigns role.
    const sourceDateValues = source.text.match(new RegExp(DATE_VALUE_RE.source, 'gi')) ?? []
    if (sourceDateValues.length > 1) {
      outcomes.push({ ...item, outcome: 'rejected_ambiguous', rejectionReason: 'multiple_date_values_in_source_block', evidenceSource: 'model_semantic' })
      continue
    }
    const hasDateValue = sourceDateValues.length === 1
    const isEmptyTableValueSurface = !source.text.trim() && source.kind === 'tableCell' &&
      (source.cellIndex == null || source.cellIndex > 0 || Boolean(source.tableContext?.columnHeaderText?.trim()))
    if (!hasDateValue && !isEmptyTableValueSurface) {
      outcomes.push({ ...item, outcome: 'rejected_invalid', rejectionReason: 'not_a_date_value_surface', evidenceSource: 'model_semantic' })
      continue
    }
    const concepts = grouped.get(item.sourceBlockId) ?? new Set<GroundedDateEvidence['dateConcept']>()
    concepts.add(item.dateConcept)
    grouped.set(item.sourceBlockId, concepts)
  }

  for (const [sourceBlockId, concepts] of grouped) {
    if (concepts.size === 1) {
      outcomes.push({ sourceBlockId, dateConcept: [...concepts][0]!, outcome: 'accepted', evidenceSource: 'model_semantic' })
    } else {
      for (const dateConcept of concepts) outcomes.push({
        sourceBlockId,
        dateConcept,
        outcome: 'rejected_contradiction',
        rejectionReason: 'one_source_block_claimed_multiple_date_concepts',
        evidenceSource: 'model_semantic',
      })
    }
  }
  return outcomes
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
      required: ['changedBlocks', 'financeEvidence', 'dateEvidence'],
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
        dateEvidence: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['sourceBlockId', 'dateConcept'],
            properties: {
              sourceBlockId: blockIdSchema,
              dateConcept: { type: 'string', enum: ['wedding_date', 'execution_date'] },
            },
          },
        },
      },
    },
  }
}
