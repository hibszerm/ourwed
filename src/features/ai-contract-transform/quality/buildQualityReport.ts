/**
 * Orchestrate post-reconstruction quality gate + Mode A/B download policy.
 */

import { findMissingProtectedValuesDetailed } from '../protectedContractData'
import type {
  ContractTransformationDataset,
  ProtectedContractData,
  TransformDocumentBlock,
  TransformedBlock,
  GroundedFinanceEvidence,
  GroundedFinanceEvidenceOutcome,
  GroundedDateEvidence,
  GroundedDateEvidenceOutcome,
  ContractTransformDiagnostics,
  QualityGateEvidenceTrace,
} from '../types'
import { verifyTransformationCompleteness } from './completenessVerifier'
import { applyDeterministicRepairs } from './deterministicRepairs'
import { buildExpectationManifest } from './expectationManifest'
import { insertAdditionalServicesIntoBlocks } from '../insertAdditionalServices'
import { expandBlocksWithParagraphInsertions } from '../expandBlocksWithInsertions'
import type { ContractParagraphInsertion } from '../expandBlocksWithInsertions'
import {
  verifyAdditionalServicesConsistency,
  verifyNoAdditionalServicesSectionWhenEmpty,
} from './additionalServicesConsistency'
import {
  verifyFinancialConsistency,
  verifyPackageScopeConsistency,
} from './financialConsistency'
import {
  verifyLocationConsistency,
  verifyReferenceNumberConsistency,
} from './locationAndReferenceConsistency'
import { documentHasUnresolvedPartyPlaceholder } from './partyPlaceholderRepair'
import {
  verifyFilledPartyIdentity,
  classifyProviderLegalSurface,
  verifyProviderRoleSparseScope,
} from './partyFilledIdentity'
import { verifyFilledLocationIdentity } from './locationFieldEvidence'
import { discoverExecutionDateEvidence } from './dateFieldEvidence'
import { resolveGroundedDateEvidence } from './groundedDateEvidence'
import { weddingDatesSemanticallyEqual } from './locationFieldEvidence'
import { fingerprintText, normalizeForMatch } from './normalize'
import type {
  DocumentQualityReport,
  QualityIssue,
  TransformationExpectationManifest,
} from './types'

function classifyTraceValue(text: string, source: string, canonical: string): string {
  if (!text.trim()) return 'missing'
  if (canonical && normalizeForMatch(text).includes(normalizeForMatch(canonical))) return 'canonical'
  if (source && normalizeForMatch(text).includes(normalizeForMatch(source))) return 'stale'
  return 'ambiguous'
}

function classifyDateTraceValue(text: string, source: string, canonical: string): string {
  if (!text.trim()) return 'missing'
  if (weddingDatesSemanticallyEqual(text, canonical)) return 'canonical'
  if (source && weddingDatesSemanticallyEqual(text, source)) return 'stale'
  return 'ambiguous'
}

/** Safe structural RCA trace; deliberately excludes document prose. */
export function buildQualityGateEvidenceTrace(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  manifest: TransformationExpectationManifest
  report: DocumentQualityReport
  repairs: DocumentQualityReport['repairs']
  mixedPartyDiagnostics?: import('./types').MixedPartyRepairDiagnostic[]
}): QualityGateEvidenceTrace {
  const byId = new Map(input.transformedBlocks.map((b) => [b.blockId, b]))
  const byOrigin = new Map<string, TransformedBlock[]>()
  for (const b of input.transformedBlocks) if (b.originSourceBlockId) byOrigin.set(b.originSourceBlockId, [...(byOrigin.get(b.originSourceBlockId) ?? []), b])
  const repairFor = (id: string) => input.repairs.filter((r) => r.blockId === id)
  const sourceFor = (id: string) => input.sourceBlocks.find((b) => b.blockId === id)
  const transformedFor = (id: string) => byId.get(id) ?? byOrigin.get(id)?.[0]
  const violations = input.report.blockingIssues.map((i) => ({
    code: i.code,
    ...(i.blockId ? { blockId: i.blockId } : {}),
    ...(i.canonicalField ? { canonicalField: i.canonicalField } : {}),
    dimension: i.canonicalField?.startsWith('customer.') ? 'party' : i.canonicalField?.startsWith('wedding.') || i.canonicalField === 'contract.executionDate' ? 'date' : i.code.includes('provider') ? 'provider' : 'other',
  }))
  const party = (input.manifest.sourcePartyEvidence ?? []).map((e) => {
    const src = sourceFor(e.blockId); const t = transformedFor(e.blockId); const repairs = repairFor(t?.blockId ?? e.blockId)
    const issues = input.report.blockingIssues.filter((i) => i.blockId === e.blockId && i.canonicalField === 'customer.names')
    return { sourceBlockId: e.blockId, ...(t?.originSourceBlockId ? { originSourceBlockId: t.originSourceBlockId } : {}), transformedBlockId: t?.blockId, ownership: e.owner === 'MIXED' ? 'mixed' : 'party', identitySurfaceCount: e.identitySurfaces.length, modelChanged: Boolean(src && t && src.text !== t.text), deterministicRepairAttempted: repairs.length > 0, deterministicRepairApplied: repairs.some((r) => r.repairCode.includes('party') || r.repairCode.includes('mixed')), repairSkipReason: repairs.length === 0 ? 'no_recorded_repair' : undefined, finalClassification: classifyTraceValue(t?.text ?? '', e.sourceText, input.dataset.clients.displayNames), groundedSpanExists: Boolean(e.customerHalfText), targetSpanUniquelyLocated: undefined, spanRepairApplied: repairs.some((r) => r.repairCode === 'preserve_mixed_party_provider_half'), qualityViolationCodes: issues.map((i) => i.code), sourceFingerprint: src ? fingerprintText(src.text) : undefined, transformedFingerprint: t ? fingerprintText(t.text) : undefined }
  })
  const mixedPartyRepairs = (input.mixedPartyDiagnostics ?? []).map((item) => {
    const transformed = item.transformedBlockId
      ? byId.get(item.transformedBlockId)
      : transformedFor(item.sourceBlockId)
    const source = sourceFor(item.sourceBlockId)
    return {
      ...item,
      postRepairPartyClassification: classifyTraceValue(
        transformed?.text ?? '',
        source?.text ?? '',
        input.dataset.clients.displayNames,
      ),
    }
  })
  const dateEvidence = [
    ...input.manifest.requiredReplacements.filter((r) => r.canonicalField === 'wedding.date' || r.canonicalField === 'contract.executionDate').map((r) => ({ field: r.canonicalField, ids: r.sourceBlockIds, sourceValues: r.sourceValues })),
    ...discoverExecutionDateEvidence(input.sourceBlocks).map((e) => ({ field: e.canonicalField, ids: [e.blockId], sourceValues: e.sourceDate ? [e.sourceDate] : [] })),
  ]
  const dates = dateEvidence.flatMap((e) => e.ids.map((id) => { const src = sourceFor(id); const t = transformedFor(id); const repairs = repairFor(t?.blockId ?? id); const canonical = e.field === 'wedding.date' ? input.dataset.dates.weddingDate : input.dataset.dates.contractExecutionDate; const issues = input.report.blockingIssues.filter((i) => i.blockId === id && i.canonicalField === e.field); return { semanticRole: e.field, sourceBlockId: id, ...(t?.originSourceBlockId ? { originSourceBlockId: t.originSourceBlockId } : {}), transformedBlockId: t?.blockId, sourceRepresentationPresent: Boolean(src?.text.trim()), modelChanged: Boolean(src && t && src.text !== t.text), postModelClassification: classifyTraceValue(t?.text ?? '', e.sourceValues[0] ?? '', canonical), deterministicRepairAttempted: repairs.length > 0, deterministicRepairApplied: repairs.some((r) => r.canonicalField === e.field), repairSkipReason: repairs.length === 0 ? 'no_recorded_repair' : undefined, postRepairClassification: classifyTraceValue(t?.text ?? '', e.sourceValues[0] ?? '', canonical), qualityViolationCodes: issues.map((i) => i.code), sourceFingerprint: src ? fingerprintText(src.text) : undefined, transformedFingerprint: t ? fingerprintText(t.text) : undefined } }))
  const provider = input.sourceBlocks.flatMap((src) => {
    const ownership = classifyProviderLegalSurface({
      sourceBlock: src,
      partyEvidence: input.manifest.sourcePartyEvidence ?? [],
    })
    if (ownership.classification !== 'provider_legal_only') return []
    const t = transformedFor(src.blockId)
    const issue = input.report.blockingIssues.find(
      (item) => item.code === 'unnecessary_provider_role_rewrite' && item.blockId === src.blockId,
    )
    return [{
      sourceBlockId: src.blockId,
      transformedBlockId: t?.blockId,
      sourceOwnership: ownership.classification,
      ownershipReason: ownership.reasonCode,
      protectionDecision: src.modelContext?.modelEditable === false ? 'protected' : 'editable',
      protectionReason: src.modelContext?.protectionReason ?? 'none',
      modelVisible: true,
      modelEditable: src.modelContext?.modelEditable !== false,
      modelChanged: Boolean(t && src.text !== t.text),
      deterministicRestorationAttempted: false,
      deterministicRestorationApplied: false,
      finalQualityResult: issue ? 'fail' : 'pass',
      qualityViolationCode: issue?.code,
      sourceFingerprint: fingerprintText(src.text),
      transformedFingerprint: t ? fingerprintText(t.text) : undefined,
    }]
  })
  return { party, mixedPartyRepairs, dates, provider, violations }
}

/** Financial codes that block Mode A download (legal obligation / money integrity). */
const MODE_A_FINANCIAL_BLOCK_CODES = new Set([
  'money_words_mismatch',
  'payment_structure_mismatch',
  'payment_arithmetic_mismatch',
  'deposit_missing',
  'remaining_payment_missing',
  'package_scope_mismatch',
])

/** Party placeholder integrity — known structural slots must not remain unresolved. */
const MODE_A_PARTY_PLACEHOLDER_CODES = new Set([
  'unresolved_party_placeholder',
])

/** CG7.1 — filled-party identity / stale contracting-client identity. */
const MODE_A_PARTY_IDENTITY_CODES = new Set([
  'stale_party_identity_remaining',
  'party_identity_canonical_missing',
  'party_identity_block_empty',
  'invented_second_party',
  'unnecessary_provider_role_rewrite',
])

/** Location integrity codes that block Mode A product download (A5). */
const MODE_A_LOCATION_INTEGRITY_CODES = new Set([
  'stale_source_value_remaining',
  'expected_dataset_value_missing',
  'partial_field_application',
  'mixed_source_target',
  'invented_location_for_absent_role',
  'stale_location_identity_remaining',
  'location_identity_canonical_missing',
  'location_identity_block_missing',
  'location_sentinel_unresolved',
])

const LOCATION_CANONICAL_FIELDS = new Set([
  'wedding.preparationLocation',
  'wedding.ceremonyLocation',
  'wedding.receptionLocation',
])

export function isModeALocationIntegrityBlock(issue: {
  code: string
  canonicalField?: string
}): boolean {
  if (!issue.canonicalField) return false
  if (!LOCATION_CANONICAL_FIELDS.has(issue.canonicalField)) return false
  return MODE_A_LOCATION_INTEGRITY_CODES.has(issue.code)
}

function extractYear(dateText?: string): string | undefined {
  if (!dateText) return undefined
  const m = dateText.match(/(20\d{2})/)
  return m?.[1]
}

function parseMoney(formatted?: string): number | null {
  if (!formatted) return null
  const d = formatted.replace(/[^\d]/g, '')
  return d ? Number(d) : null
}

export function buildQualityReport(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  protectedData: ProtectedContractData
  manifest?: TransformationExpectationManifest
  repairs?: DocumentQualityReport['repairs']
  additionalServicesDiagnostics?: import('../insertAdditionalServices').AdditionalServicesInsertionDiagnostics
  paragraphInsertions?: ContractParagraphInsertion[]
  /** Transformed blocks before virtual paragraph expansion (for anchor integrity). */
  additionalServicesBlocksBeforeExpansion?: TransformedBlock[]
  dateEvidenceIssues?: QualityIssue[]
}): DocumentQualityReport {
  const manifest =
    input.manifest ??
    buildExpectationManifest({
      sourceBlocks: input.sourceBlocks,
      dataset: input.dataset,
      protectedData: input.protectedData,
    })

  const completeness = verifyTransformationCompleteness({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.transformedBlocks,
    dataset: input.dataset,
    manifest,
  })

  const financial = verifyFinancialConsistency({
    dataset: input.dataset,
    transformedBlocks: input.transformedBlocks,
    paymentRepresentation: {
      deposit: manifest.representedConcepts?.deposit ?? true,
      remaining: manifest.representedConcepts?.remaining ?? true,
      total: manifest.representedConcepts?.totalPrice ?? true,
    },
  })

  const sourceTotal = (() => {
    for (const b of input.sourceBlocks) {
      const m = b.text.match(/(\d[\d\s]*)\s*zł/)
      if (m && /wynagrodzen|słownie|umow/i.test(b.text)) {
        return parseMoney(m[0])
      }
    }
    return null
  })()
  const targetTotal = parseMoney(input.dataset.finances.contractValueFormatted)
  const priceChanged =
    sourceTotal != null && targetTotal != null && sourceTotal !== targetTotal

  const hasExplicitScope = Boolean(input.dataset.package.explicitServiceScope)
  const packageIssues = verifyPackageScopeConsistency({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.transformedBlocks,
    hasExplicitScope,
    priceChanged: Boolean(priceChanged),
  })

  const location = verifyLocationConsistency({
    dataset: input.dataset,
    transformedBlocks: input.transformedBlocks,
    manifest,
  })

  const referenceIssues = verifyReferenceNumberConsistency({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.transformedBlocks,
    weddingYear: extractYear(input.dataset.dates.weddingDate),
    executionYear: extractYear(input.dataset.dates.contractExecutionDate),
  })

  const missingProtected = findMissingProtectedValuesDetailed(
    input.protectedData,
    input.transformedBlocks.map((b) => b.text).join('\n'),
  )
  const changedProtectedFields = missingProtected.map(
    (m) => m.canonicalField || m.diagnosticCode,
  )
  const protectionIssues: QualityIssue[] = missingProtected.map((m) => ({
    code: 'protected_value_changed',
    severity: 'blocking' as const,
    canonicalField: m.canonicalField,
    blockId: m.sourceBlockId,
    safeDescription: 'A protected provider/legal value is missing or changed',
  }))

  const additionalServicesIssues = [
    ...verifyAdditionalServicesConsistency({
      transformedBlocks: input.transformedBlocks,
      sourceBlocks: input.sourceBlocks,
      dataset: input.dataset,
      expectation: manifest.additionalServices,
      diagnostics: input.additionalServicesDiagnostics,
      blocksBeforeExpansion: input.additionalServicesBlocksBeforeExpansion,
      paragraphInsertions: input.paragraphInsertions,
    }),
    ...verifyNoAdditionalServicesSectionWhenEmpty({
      transformedBlocks: input.transformedBlocks,
      dataset: input.dataset,
    }),
  ]

  const partyPlaceholderIssues: QualityIssue[] = []
  for (const b of input.transformedBlocks) {
    if (!documentHasUnresolvedPartyPlaceholder(b.text)) continue
    // Only block when source also had the placeholder (structural slot),
    // not when arbitrary prose coincidentally matches.
    const src = input.sourceBlocks.find((s) => s.blockId === b.blockId)
    if (src && documentHasUnresolvedPartyPlaceholder(src.text)) {
      partyPlaceholderIssues.push({
        code: 'unresolved_party_placeholder',
        severity: 'blocking',
        canonicalField: 'customer.names',
        blockId: b.blockId,
        safeDescription:
          'Known party placeholder remains unresolved after transformation',
      })
    }
  }

  const partyEvidence = manifest.sourcePartyEvidence ?? []
  const filledPartyIssues = verifyFilledPartyIdentity({
    evidence: partyEvidence,
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.transformedBlocks,
    dataset: input.dataset,
  })
  const providerScopeIssues = verifyProviderRoleSparseScope({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.transformedBlocks,
    partyEvidence,
  })
  const locationEvidence = manifest.sourceLocationEvidence ?? []
  const filledLocationIssues = verifyFilledLocationIdentity({
    evidence: locationEvidence,
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: input.transformedBlocks,
    dataset: input.dataset,
  })

  const allIssues: QualityIssue[] = [
    ...completeness.issues,
    ...financial.issues,
    ...packageIssues,
    ...location.issues,
    ...referenceIssues,
    ...protectionIssues,
    ...additionalServicesIssues,
    ...partyPlaceholderIssues,
    ...filledPartyIssues,
    ...providerScopeIssues,
    ...filledLocationIssues,
    ...(input.dateEvidenceIssues ?? []),
  ]

  // Deduplicate by code+field+block
  const seen = new Set<string>()
  const unique: QualityIssue[] = []
  for (const issue of allIssues) {
    const key = `${issue.code}|${issue.canonicalField ?? ''}|${issue.blockId ?? ''}|${issue.safeDescription}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(issue)
  }

  return {
    completeness: completeness.summary,
    protection: {
      status: changedProtectedFields.length === 0 ? 'pass' : 'fail',
      changedProtectedFields,
    },
    financialConsistency: {
      ...financial.summary,
      issues: [...financial.summary.issues, ...packageIssues.filter((i) =>
        MODE_A_FINANCIAL_BLOCK_CODES.has(i.code) ||
        i.code === 'price_changed_without_explicit_service_scope',
      )],
    },
    locationConsistency: location.summary,
    businessConsistency: {
      referenceNumberIssues: referenceIssues,
      packageScopeIssues: packageIssues,
    },
    repairs: input.repairs ?? [],
    blockingIssues: unique.filter((i) => i.severity === 'blocking'),
    reviewIssues: unique.filter((i) => i.severity === 'review_required'),
    warnings: unique.filter(
      (i) => i.severity === 'warning' || i.severity === 'info',
    ),
  }
}

export function runPostReconstructionQualityGate(input: {
  sourceBlocks: TransformDocumentBlock[]
  transformedBlocks: TransformedBlock[]
  dataset: ContractTransformationDataset
  protectedData: ProtectedContractData
  mode: 'full_ai' | 'guarded'
  financeEvidence?: GroundedFinanceEvidence[]
  financeEvidenceDiagnostics?: GroundedFinanceEvidenceOutcome[]
  dateEvidence?: GroundedDateEvidence[]
  dateEvidenceDiagnostics?: GroundedDateEvidenceOutcome[]
}): {
  blocks: TransformedBlock[]
  manifest: TransformationExpectationManifest
  report: DocumentQualityReport
  downloadAllowed: boolean
  paragraphInsertions: ContractParagraphInsertion[]
  diagnostics: ContractTransformDiagnostics
} {
  const manifest = buildExpectationManifest({
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
    protectedData: input.protectedData,
  })

  const resolvedDateEvidence = resolveGroundedDateEvidence({
    evidence: input.dateEvidenceDiagnostics ?? (input.dateEvidence ?? []).map((item) => ({ ...item, outcome: 'accepted' as const, evidenceSource: 'model_semantic' as const })),
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
    manifest,
  })

  const repaired = applyDeterministicRepairs({
    blocks: input.transformedBlocks,
    dataset: input.dataset,
    manifest,
    sourceBlocks: input.sourceBlocks,
    financeEvidence: input.financeEvidence,
    groundedDateTargets: resolvedDateEvidence.targets,
    blockedDateRepairTargets: resolvedDateEvidence.blockedRepairTargets,
  })

  const additionalServices = insertAdditionalServicesIntoBlocks({
    blocks: repaired.blocks,
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
  })

  const expandedBlocks = expandBlocksWithParagraphInsertions({
    sourceBlocks: input.sourceBlocks,
    blocks: additionalServices.blocks,
    insertions: additionalServices.paragraphInsertions,
  })

  const report = buildQualityReport({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: expandedBlocks,
    dataset: input.dataset,
    protectedData: input.protectedData,
    manifest,
    repairs: repaired.repairs,
    additionalServicesDiagnostics: additionalServices.diagnostics,
    paragraphInsertions: additionalServices.paragraphInsertions,
    additionalServicesBlocksBeforeExpansion: additionalServices.blocks,
    dateEvidenceIssues: resolvedDateEvidence.issues,
  })
  const qualityGateEvidence = buildQualityGateEvidenceTrace({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: expandedBlocks,
    dataset: input.dataset,
    manifest,
    report,
    repairs: repaired.repairs,
    mixedPartyDiagnostics: repaired.mixedPartyDiagnostics,
  })
  const diagnostics: ContractTransformDiagnostics = {
    groundedFinanceEvidence: input.financeEvidenceDiagnostics ?? [],
    dateEvidence: resolvedDateEvidence.diagnostics.map((item) => {
      const target = resolvedDateEvidence.targets.find((entry) => entry.sourceBlockId === item.sourceBlockId && entry.dateConcept === item.dateConcept)
      if (!target) return item
      const source = input.sourceBlocks.find((block) => block.blockId === item.sourceBlockId)
      const transformed = expandedBlocks.find((block) => block.blockId === item.sourceBlockId || block.originSourceBlockId === item.sourceBlockId)
      const field = item.dateConcept === 'wedding_date' ? 'wedding.date' : 'contract.executionDate'
      const repair = repaired.repairs.find((entry) => entry.canonicalField === field && entry.blockId === transformed?.blockId)
      const canonical = item.dateConcept === 'wedding_date' ? input.dataset.dates.weddingDate : input.dataset.dates.contractExecutionDate
      const sourceDate = source?.text.match(/(?:\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s*r\.)?\b|\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+\d{4}(?:\s*r\.)?\b)/i)?.[0] ?? ''
      const postRepairClassification = classifyDateTraceValue(transformed?.text ?? '', sourceDate, canonical)
      return {
        ...item,
        resolvedTransformedBlockId: transformed?.blockId,
        repairAttempted: true,
        repairApplied: Boolean(repair),
        repairSkipReason: repair ? undefined : transformed ? postRepairClassification === 'canonical' ? 'already_canonical' : 'surface_not_repairable' : 'transformed_target_not_found',
        postRepairClassification,
      }
    }),
    crossSurfaceFinance: repaired.crossSurfaceFinance,
    financeRepairs: repaired.financeDiagnostics,
    totalWords: repaired.totalWords,
    qualityGateEvidence,
  }

  let downloadAllowed: boolean
  if (input.mode === 'guarded') {
    downloadAllowed = report.blockingIssues.length === 0
  } else {
    // Mode A: block hard financial + location integrity (A5 stale/missing venues)
    const financialBlock = report.blockingIssues.some((i) =>
      MODE_A_FINANCIAL_BLOCK_CODES.has(i.code),
    )
    const locationBlock = report.blockingIssues.some((i) =>
      isModeALocationIntegrityBlock(i),
    )
    const partyPlaceholderBlock = report.blockingIssues.some((i) =>
      MODE_A_PARTY_PLACEHOLDER_CODES.has(i.code),
    )
    const partyIdentityBlock = report.blockingIssues.some((i) =>
      MODE_A_PARTY_IDENTITY_CODES.has(i.code),
    )
    const groundedDateConflict = report.blockingIssues.some((i) =>
      i.code === 'date_evidence_conflict' || i.code === 'date_evidence_ambiguous',
    )
    downloadAllowed =
      !financialBlock &&
      !locationBlock &&
      !partyPlaceholderBlock &&
      !partyIdentityBlock &&
      !groundedDateConflict
  }

  return {
    blocks: additionalServices.blocks,
    manifest,
    report,
    downloadAllowed,
    paragraphInsertions: additionalServices.paragraphInsertions,
    diagnostics,
  }
}

export {
  MODE_A_FINANCIAL_BLOCK_CODES,
  MODE_A_PARTY_PLACEHOLDER_CODES,
  MODE_A_PARTY_IDENTITY_CODES,
}
