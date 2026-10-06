import type { WeddingContractPackageSnapshot } from '../types'

export type PackageSnapshotCardModel = {
  name: string | null
  originalDescription: string | null
  includedItems: string[]
  coverageHours: number | null
  basePrice?: number | null
  currency?: string | null
  coverageTimeRange?: string | null
  deliveryDeadlineText: string | null
  sourceFileName?: string | null
  createdAt?: string | null
  includeToggle?: { checked: boolean; onChange: (checked: boolean) => void }
  compact?: boolean
}

export function packageSnapshotFromRow(
  snapshot: WeddingContractPackageSnapshot,
  sourceFileName?: string | null,
): PackageSnapshotCardModel {
  const metadata = snapshot.metadata ?? {}
  const coverageTimeRange = typeof metadata.coverageTimeRange === 'string'
    ? metadata.coverageTimeRange
    : null
  return {
    name: snapshot.name,
    originalDescription: snapshot.originalDescription,
    includedItems: snapshot.includedItems,
    coverageHours: snapshot.coverageHours,
    basePrice: snapshot.basePrice,
    currency: snapshot.currency,
    coverageTimeRange,
    deliveryDeadlineText: snapshot.deliveryDeadlineText,
    sourceFileName: sourceFileName ?? null,
    createdAt: snapshot.createdAt,
  }
}
