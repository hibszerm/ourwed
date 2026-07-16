import type { StudioPackage } from '@/types/package'
import { studioPackageToLegacyPackage } from '@/types/package'
import type { Wedding, WeddingDeliverable } from '@/types/wedding'
import { createWeddingDeliverablesFromPackage } from '@/lib/utils/deliverables'

/**
 * When the couple changes package:
 * - update package snapshots (name, price, deposit, color)
 * - regenerate package deliverables from catalog items
 * - preserve manually added additional services / extra-service snapshots
 *
 * @param extrasTotal Sum of wedding_extra_services price_snapshot * quantity.
 *   Contract value = package snapshot + extras snapshots.
 */
export function applyPackageChangeToWedding(
  wedding: Wedding,
  pkg: StudioPackage,
  extrasTotal = 0,
): Wedding {
  const nextPrice = pkg.price + extrasTotal
  if (
    wedding.packageId === pkg.id &&
    wedding.packageName === pkg.name &&
    wedding.price === nextPrice
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
    packageId: pkg.id,
    packageName: pkg.name,
    price: nextPrice,
    depositAmount: pkg.depositAmount,
    currency: pkg.currency,
    accentColor: pkg.color ?? wedding.accentColor,
    deliverables: [...fromPackage, ...additional],
  }
}
