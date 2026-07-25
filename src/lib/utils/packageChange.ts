import type { StudioPackage } from '@/types/package'
import { studioPackageToLegacyPackage } from '@/types/package'
import type { Wedding, WeddingDeliverable } from '@/types/wedding'
import {
  applyCommercialPackageSnapshot,
  type ApplyPackageSnapshotOptions,
} from '@/lib/utils/commercial'
import { createWeddingDeliverablesFromPackage } from '@/lib/utils/deliverables'

/**
 * When the couple changes package:
 * - rewrite commercial snapshot (name, terms, items, …)
 * - regenerate package deliverables from the new snapshot items
 * - preserve manually added additional services / extra-service snapshots
 *
 * Does not mutate the catalog package.
 */
export function applyPackageChangeToWedding(
  wedding: Wedding,
  pkg: StudioPackage,
  extrasTotalOrOptions: number | ApplyPackageSnapshotOptions = 0,
): Wedding {
  const commercial = applyCommercialPackageSnapshot(
    wedding,
    pkg,
    extrasTotalOrOptions,
  )
  if (
    wedding.packageId === commercial.packageId &&
    wedding.packageName === commercial.packageName &&
    wedding.price === commercial.price &&
    wedding.coverageHours === commercial.coverageHours &&
    wedding.coverageEndTime === commercial.coverageEndTime &&
    wedding.overtimeRate === commercial.overtimeRate &&
    wedding.deliveryMonths === commercial.deliveryMonths &&
    wedding.deliveryDays === commercial.deliveryDays &&
    JSON.stringify(wedding.packageItems) ===
      JSON.stringify(commercial.packageItems)
  ) {
    return wedding
  }

  const additional = wedding.deliverables.filter((d) => d.source === 'additional')
  const fromPackage: WeddingDeliverable[] = createWeddingDeliverablesFromPackage(
    wedding.id,
    studioPackageToLegacyPackage(pkg),
  )

  return {
    ...wedding,
    ...commercial,
    deliverables: [...fromPackage, ...additional],
  }
}
