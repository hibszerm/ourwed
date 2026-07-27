/**
 * Canonical package-contract required-data readiness.
 *
 * Single source of truth for:
 * - missingCategories
 * - missingRegistryKeys
 * - required_data_ready health check
 * - attention kind (required-data aspect)
 *
 * Do not recompute these independently downstream.
 */

import {
  evaluatePackageContractReadiness,
  type PackageContractUserCategory,
} from './packageContractAllowlist'
import type { ClientPartyReadinessResult } from './clientPartyReadiness'

export type PackageContractBlockingIssue = {
  code: string
  /** Polish product-facing explanation when shown to users. */
  message: string
  /** DEV / health evidence code. */
  evidence: string
}

export type PackageContractRequiredDataReadiness = {
  ready: boolean
  missingCategories: PackageContractUserCategory[]
  missingRegistryKeys: string[]
  blockingIssues: PackageContractBlockingIssue[]
  /** Evidence codes explaining why ready is false (never empty when !ready). */
  evidence: string[]
  clientParty: ClientPartyReadinessResult
  userMessage: string | null
}

export type SharedSpanConflictInput = {
  paragraphIndex: number
  startOffset: number
  endOffset: number
  registryKeys: string[]
}

/**
 * Authoritative required-data evaluation.
 * Category gaps and explicit blockers (e.g. shared spans) are both visible.
 */
export function evaluatePackageContractRequiredDataReadiness(input: {
  allowedRegistryKeys: string[]
  sharedSpanConflicts?: readonly SharedSpanConflictInput[]
}): PackageContractRequiredDataReadiness {
  const base = evaluatePackageContractReadiness({
    allowedRegistryKeys: input.allowedRegistryKeys,
  })

  const blockingIssues: PackageContractBlockingIssue[] = []
  if ((input.sharedSpanConflicts?.length ?? 0) > 0) {
    blockingIssues.push({
      code: 'shared_physical_span_conflict',
      message:
        'Niektóre rozpoznane pola umowy nakładają się na siebie i nie mogą zostać bezpiecznie użyte do generowania dokumentu. Konflikt dotyczy danych klientów.',
      evidence: 'diagnostic:shared_physical_span_conflict',
    })
  }

  const evidence: string[] = []
  if (base.missingRequiredCategories.length > 0) {
    evidence.push('diagnostic:required_categories_incomplete')
  }
  for (const issue of blockingIssues) {
    evidence.push(issue.evidence)
  }

  const ready =
    base.missingRequiredCategories.length === 0 &&
    base.missingRegistryKeys.length === 0 &&
    blockingIssues.length === 0

  // Invariant: ready iff no reported gaps.
  const consistentReady =
    ready ===
    (base.missingRequiredCategories.length === 0 &&
      base.missingRegistryKeys.length === 0 &&
      blockingIssues.length === 0)

  if (!consistentReady && import.meta.env?.DEV) {
    console.error('[package-contract-readiness-aggregation]', {
      error: 'invariant_violation_in_evaluator',
      baseReady: base.ready,
      ready,
    })
  }

  let userMessage: string | null = null
  if (!ready) {
    userMessage =
      blockingIssues[0]?.message ??
      base.userMessage ??
      'Rozpoznaliśmy część danych, ale dokument nie zawiera wszystkich informacji potrzebnych do automatycznego generowania.'
  }

  const result: PackageContractRequiredDataReadiness = {
    ready,
    missingCategories: base.missingRequiredCategories,
    missingRegistryKeys: base.missingRegistryKeys,
    blockingIssues,
    evidence,
    clientParty: base.clientParty,
    userMessage,
  }

  console.info('[package-contract-readiness-aggregation]', {
    sourceValues: {
      categoryReady: base.ready,
      clientPartyReady: base.clientParty.ready,
      sharedSpanConflictCount: input.sharedSpanConflicts?.length ?? 0,
      missingCategories: result.missingCategories,
      missingRegistryKeys: result.missingRegistryKeys,
      blockingIssueCodes: result.blockingIssues.map((b) => b.code),
    },
    derivedValues: {
      finalReady: result.ready,
      evidence: result.evidence,
    },
  })

  return result
}

/** Development / test assertion — never throw in production callers. */
export function assertPackageContractRequiredDataConsistency(
  result: PackageContractRequiredDataReadiness,
): void {
  const gaps =
    result.missingCategories.length +
    result.missingRegistryKeys.length +
    result.blockingIssues.length

  if (result.ready && gaps > 0) {
    throw new Error(
      'required-data ready=true but missing/blocking data is non-empty',
    )
  }
  if (!result.ready && gaps === 0) {
    throw new Error(
      'required-data ready=false with no missingCategories, missingRegistryKeys, or blockingIssues',
    )
  }
  if (
    result.evidence.includes('diagnostic:required_categories_incomplete') &&
    result.missingCategories.length === 0
  ) {
    throw new Error(
      'evidence required_categories_incomplete without missingCategories',
    )
  }
  if (!result.ready && result.evidence.length === 0) {
    throw new Error('required-data not ready without evidence codes')
  }
}
