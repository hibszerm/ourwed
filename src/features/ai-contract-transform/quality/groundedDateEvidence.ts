import type {
  DateSemanticConcept,
  GroundedDateEvidenceOutcome,
  TransformDocumentBlock,
  ContractTransformationDataset,
} from '../types'
import type { QualityIssue, TransformationExpectationManifest } from './types'
import { weddingDatesSemanticallyEqual } from './locationFieldEvidence'

export type GroundedDateResolution = {
  manifest: TransformationExpectationManifest
  targets: Array<{ sourceBlockId: string; dateConcept: DateSemanticConcept }>
  diagnostics: GroundedDateEvidenceOutcome[]
  issues: QualityIssue[]
  blockedRepairTargets: Array<{ sourceBlockId: string; dateConcept: DateSemanticConcept }>
}

const DATE_VALUE_RE = /(?:\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s*r\.)?\b|\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}(?:\s*r\.)?\b)/i

function canonicalFor(dataset: ContractTransformationDataset, concept: DateSemanticConcept): string {
  return concept === 'wedding_date' ? dataset.dates.weddingDate : dataset.dates.contractExecutionDate
}

function fieldFor(concept: DateSemanticConcept): 'wedding.date' | 'contract.executionDate' {
  return concept === 'wedding_date' ? 'wedding.date' : 'contract.executionDate'
}

function lexicalIds(manifest: TransformationExpectationManifest, concept: DateSemanticConcept): Set<string> {
  const field = fieldFor(concept)
  const ids = new Set<string>()
  for (const replacement of manifest.requiredReplacements) {
    if (replacement.canonicalField !== field) continue
    for (const id of [...replacement.sourceBlockIds, ...replacement.requiredContextBlockIds]) ids.add(id)
  }
  for (const value of manifest.sourceSpecificValues) {
    if (value.canonicalField !== field) continue
    for (const id of value.sourceBlockIds) ids.add(id)
  }
  return ids
}

function attachTargetToManifest(input: {
  manifest: TransformationExpectationManifest
  source: TransformDocumentBlock
  concept: DateSemanticConcept
  dataset: ContractTransformationDataset
}): void {
  const { manifest, source, concept, dataset } = input
  const field = fieldFor(concept)
  const canonical = canonicalFor(dataset, concept)
  const sourceDate = source.text.match(DATE_VALUE_RE)?.[0] ?? ''
  const stale = Boolean(sourceDate && !(concept === 'wedding_date'
    ? weddingDatesSemanticallyEqual(sourceDate, canonical)
    : weddingDatesSemanticallyEqual(sourceDate, canonical)))

  manifest.representedConcepts ??= {
    party: false, preparationLocation: false, ceremonyLocation: false, receptionLocation: false,
    weddingDate: false, totalPrice: false, deposit: false, remaining: false, customerAddress: false,
    customerPhone: false, contractExecutionDate: false, packageName: false,
  }
  if (concept === 'wedding_date') manifest.representedConcepts.weddingDate = true
  else manifest.representedConcepts.contractExecutionDate = true

  if (sourceDate) {
    manifest.sourceSpecificValues.push({
      canonicalField: field,
      sourceValue: sourceDate,
      normalizedValue: sourceDate,
      sourceBlockIds: [source.blockId],
      sourceSpans: [{ blockId: source.blockId, start: source.text.indexOf(sourceDate), end: source.text.indexOf(sourceDate) + sourceDate.length }],
      context: 'date_surface',
      mustDisappear: stale,
    })
  }

  const existing = manifest.requiredFields.find((requirement) => requirement.canonicalField === field)
  if (existing) {
    existing.sourceValues = [...new Set([...existing.sourceValues, ...(sourceDate && stale ? [sourceDate] : [])])]
    existing.expectedValues = [...new Set([...existing.expectedValues, canonical])]
    existing.expectedContexts = [...(existing.expectedContexts ?? []), { kind: 'date_surface', blockIds: [source.blockId] }]
    if (stale) existing.requirement = 'must_replace_source'
  } else {
    manifest.requiredFields.push({
      canonicalField: field,
      sourceValues: sourceDate && stale ? [sourceDate] : [],
      expectedValues: [canonical],
      requirement: stale ? 'must_replace_source' : 'must_appear',
      expectedContexts: [{ kind: 'date_surface', blockIds: [source.blockId] }],
    })
  }

  if (!manifest.requiredReplacements.some((replacement) => replacement.canonicalField === field && replacement.requiredContextBlockIds.includes(source.blockId))) {
    manifest.requiredReplacements.push({
      canonicalField: field,
      sourceValues: sourceDate && stale ? [sourceDate] : [],
      targetRenderedValues: [canonical],
      sourceBlockIds: [source.blockId],
      requiredContextBlockIds: [source.blockId],
      replacementPolicy: 'replace_in_contexts',
    })
  }
}

/** Merge model semantic roles with existing lexical discovery without overriding conflicts. */
export function resolveGroundedDateEvidence(input: {
  evidence: GroundedDateEvidenceOutcome[]
  sourceBlocks: TransformDocumentBlock[]
  dataset: ContractTransformationDataset
  manifest: TransformationExpectationManifest
}): GroundedDateResolution {
  const diagnostics = input.evidence.map((item) => ({ ...item }))
  const issues: QualityIssue[] = []
  const targets: GroundedDateResolution['targets'] = []
  const blockedRepairTargets: GroundedDateResolution['blockedRepairTargets'] = []
  const sourceById = new Map(input.sourceBlocks.map((block) => [block.blockId, block]))
  const accepted = diagnostics.filter((item) => item.outcome === 'accepted')

  for (const item of diagnostics) {
    if (item.outcome !== 'rejected_contradiction') continue
    issues.push({
      code: 'date_evidence_conflict',
      severity: 'blocking',
      canonicalField: fieldFor(item.dateConcept),
      blockId: item.sourceBlockId,
      safeDescription: 'Grounded semantic date evidence contains conflicting role claims',
    })
    blockedRepairTargets.push({ sourceBlockId: item.sourceBlockId, dateConcept: item.dateConcept })
  }
  for (const item of diagnostics) {
    if (item.outcome !== 'rejected_ambiguous') continue
    issues.push({
      code: 'date_evidence_ambiguous',
      severity: 'blocking',
      canonicalField: fieldFor(item.dateConcept),
      blockId: item.sourceBlockId,
      safeDescription: 'Grounded semantic date evidence does not identify one unambiguous source date value',
    })
    blockedRepairTargets.push({ sourceBlockId: item.sourceBlockId, dateConcept: item.dateConcept })
  }

  for (const concept of ['wedding_date', 'execution_date'] as const) {
    const rows = accepted.filter((item) => item.dateConcept === concept)
    const ids = [...new Set(rows.map((item) => item.sourceBlockId))]
    if (ids.length > 1) {
      for (const row of rows) {
        row.outcome = 'rejected_ambiguous'
        row.rejectionReason = 'multiple_source_blocks_claimed_same_date_concept'
        blockedRepairTargets.push({ sourceBlockId: row.sourceBlockId, dateConcept: row.dateConcept })
      }
      for (const sourceBlockId of lexicalIds(input.manifest, concept)) blockedRepairTargets.push({ sourceBlockId, dateConcept: concept })
      issues.push({ code: 'date_evidence_ambiguous', severity: 'blocking', canonicalField: fieldFor(concept), safeDescription: 'Grounded date evidence identifies multiple competing source value surfaces' })
      continue
    }
    if (ids.length === 0) continue

    const sourceBlockId = ids[0]!
    const opposite: DateSemanticConcept = concept === 'wedding_date' ? 'execution_date' : 'wedding_date'
    const conflict = lexicalIds(input.manifest, opposite).has(sourceBlockId)
    if (conflict) {
      for (const row of rows) {
        row.outcome = 'rejected_contradiction'
        row.rejectionReason = 'conflicts_with_existing_lexical_date_role'
      }
      blockedRepairTargets.push({ sourceBlockId, dateConcept: concept }, { sourceBlockId, dateConcept: opposite })
      issues.push({ code: 'date_evidence_conflict', severity: 'blocking', canonicalField: fieldFor(concept), blockId: sourceBlockId, safeDescription: 'Grounded semantic date role conflicts with existing source date-role evidence' })
      continue
    }

    const source = sourceById.get(sourceBlockId)
    if (!source) continue
    const sameRoleLexicalIds = lexicalIds(input.manifest, concept)
    if (sameRoleLexicalIds.size > 0 && !sameRoleLexicalIds.has(sourceBlockId)) {
      // Existing role evidence and model evidence point at different surfaces.
      // Keep both immutable and require quality validation to resolve the conflict.
      for (const row of rows) {
        row.outcome = 'rejected_contradiction'
        row.rejectionReason = 'conflicts_with_existing_lexical_target'
      }
      for (const id of sameRoleLexicalIds) blockedRepairTargets.push({ sourceBlockId: id, dateConcept: concept })
      blockedRepairTargets.push({ sourceBlockId, dateConcept: concept })
      issues.push({ code: 'date_evidence_conflict', severity: 'blocking', canonicalField: fieldFor(concept), blockId: sourceBlockId, safeDescription: 'Grounded semantic date target conflicts with existing source date target' })
      continue
    }

    input.manifest.groundedDateTargets = [...(input.manifest.groundedDateTargets ?? []), { sourceBlockId, dateConcept: concept }]
    if (!sameRoleLexicalIds.has(sourceBlockId)) attachTargetToManifest({ manifest: input.manifest, source, concept, dataset: input.dataset })
    targets.push({ sourceBlockId, dateConcept: concept })
  }

  const uniqueBlockedRepairTargets = [...new Map(blockedRepairTargets.map((item) => [`${item.sourceBlockId}:${item.dateConcept}`, item])).values()]
  return { manifest: input.manifest, targets, diagnostics, issues, blockedRepairTargets: uniqueBlockedRepairTargets }
}
