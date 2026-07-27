/**
 * Orchestrate post-reconstruction quality gate + Mode A/B download policy.
 */

import { findMissingProtectedValuesDetailed } from '../protectedContractData'
import type {
  ContractTransformationDataset,
  ProtectedContractData,
  TransformDocumentBlock,
  TransformedBlock,
} from '../types'
import { verifyTransformationCompleteness } from './completenessVerifier'
import { applyDeterministicRepairs } from './deterministicRepairs'
import { buildExpectationManifest } from './expectationManifest'
import {
  verifyFinancialConsistency,
  verifyPackageScopeConsistency,
} from './financialConsistency'
import {
  verifyLocationConsistency,
  verifyReferenceNumberConsistency,
} from './locationAndReferenceConsistency'
import type {
  DocumentQualityReport,
  QualityIssue,
  TransformationExpectationManifest,
} from './types'

/** Financial codes that block Mode A download (legal obligation / money integrity). */
const MODE_A_FINANCIAL_BLOCK_CODES = new Set([
  'money_words_mismatch',
  'payment_structure_mismatch',
  'payment_arithmetic_mismatch',
  'deposit_missing',
  'remaining_payment_missing',
  'package_scope_mismatch',
])

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

  const allIssues: QualityIssue[] = [
    ...completeness.issues,
    ...financial.issues,
    ...packageIssues,
    ...location.issues,
    ...referenceIssues,
    ...protectionIssues,
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
}): {
  blocks: TransformedBlock[]
  manifest: TransformationExpectationManifest
  report: DocumentQualityReport
  downloadAllowed: boolean
} {
  const manifest = buildExpectationManifest({
    sourceBlocks: input.sourceBlocks,
    dataset: input.dataset,
    protectedData: input.protectedData,
  })

  const repaired = applyDeterministicRepairs({
    blocks: input.transformedBlocks,
    dataset: input.dataset,
    manifest,
    sourceBlocks: input.sourceBlocks,
  })

  const report = buildQualityReport({
    sourceBlocks: input.sourceBlocks,
    transformedBlocks: repaired.blocks,
    dataset: input.dataset,
    protectedData: input.protectedData,
    manifest,
    repairs: repaired.repairs,
  })

  let downloadAllowed: boolean
  if (input.mode === 'guarded') {
    downloadAllowed = report.blockingIssues.length === 0
  } else {
    // Mode A: allow with review / completeness defects; block hard financial
    const financialBlock = report.blockingIssues.some((i) =>
      MODE_A_FINANCIAL_BLOCK_CODES.has(i.code),
    )
    downloadAllowed = !financialBlock
  }

  return {
    blocks: repaired.blocks,
    manifest,
    report,
    downloadAllowed,
  }
}

export { MODE_A_FINANCIAL_BLOCK_CODES }
