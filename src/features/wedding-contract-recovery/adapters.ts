/**
 * Adapter for historical contract-recovery payloads (v1 → current UI shape).
 * Does not mutate stored DB rows; returns a safe in-memory view.
 */

import type {
  ContractRecoveryExtraction,
  RecoveryProposal,
  WeddingContractPackageSnapshot,
} from './types'
import { emptyStringField } from './schema/extractionSchema'
import { cleanupPackageIncludedItems } from './packageItemCleanup'

export function adaptStoredExtraction(
  extraction: ContractRecoveryExtraction | null | undefined,
): ContractRecoveryExtraction | null {
  if (!extraction) return null
  const pkg = extraction.contractedPackage ?? ({} as ContractRecoveryExtraction['contractedPackage'])
  return {
    ...extraction,
    contractedPackage: {
      ...pkg,
      name: pkg.name ?? emptyStringField(),
      originalDescription: pkg.originalDescription ?? emptyStringField(),
      includedItems: Array.isArray(pkg.includedItems) ? pkg.includedItems : [],
      coverageHours: pkg.coverageHours ?? emptyNumberish(),
      coverageTimeRange: pkg.coverageTimeRange ?? emptyStringField(),
      deliveryDeadlineText: pkg.deliveryDeadlineText ?? emptyStringField(),
    },
  }
}

function emptyNumberish() {
  return {
    value: null as number | null,
    rawValue: null as string | null,
    confidence: 0,
    evidence: [] as [],
    warnings: [] as string[],
  }
}

export function adaptStoredProposal(
  proposal: RecoveryProposal | null | undefined,
): RecoveryProposal | null {
  if (!proposal) return null
  const pkg = proposal.packageSnapshotProposal
  return {
    ...proposal,
    packageSnapshotProposal: pkg
      ? {
          ...pkg,
          includedItems: cleanupPackageIncludedItems(pkg.includedItems ?? []),
          coverageTimeRange: pkg.coverageTimeRange ?? null,
          deliveryDeadlineText: pkg.deliveryDeadlineText ?? null,
          coverageHours: pkg.coverageHours ?? null,
        }
      : null,
  }
}

export function adaptPackageSnapshotRow(
  snapshot: WeddingContractPackageSnapshot,
): WeddingContractPackageSnapshot {
  return {
    ...snapshot,
    includedItems: cleanupPackageIncludedItems(snapshot.includedItems ?? []),
    metadata: snapshot.metadata ?? {},
  }
}
