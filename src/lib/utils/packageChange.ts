import type { Package } from '@/types/package'
import type { Wedding, WeddingDeliverable } from '@/types/wedding'
import { createWeddingDeliverablesFromPackage } from '@/lib/utils/deliverables'

/**
 * When the couple changes package in the portal:
 * - update package name, price, accent
 * - regenerate package deliverables
 * - preserve manually added additional services
 * Timeline persistence is the caller's responsibility (timelineEventService).
 */
export function applyPackageChangeToWedding(
  wedding: Wedding,
  pkg: Package,
): Wedding {
  if (wedding.packageName === pkg.name && wedding.price === pkg.price) {
    return wedding
  }

  const additional = wedding.deliverables.filter((d) => d.source === 'additional')
  const fromPackage: WeddingDeliverable[] = createWeddingDeliverablesFromPackage(
    wedding.id,
    pkg,
  )

  return {
    ...wedding,
    packageName: pkg.name,
    price: pkg.price,
    accentColor: pkg.color,
    deliverables: [...fromPackage, ...additional],
  }
}
