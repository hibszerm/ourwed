import type { Package } from '@/types/package'
import type { Wedding, WeddingDeliverable, WeddingTimelineEntry } from '@/types/wedding'
import { createWeddingDeliverablesFromPackage } from '@/lib/utils/deliverables'

/**
 * When the couple changes package in the portal:
 * - update package name, price, accent
 * - regenerate package deliverables
 * - preserve manually added additional services
 * - append timeline event
 */
export function applyPackageChangeToWedding(
  wedding: Wedding,
  pkg: Package,
  changedAt = new Date().toISOString().slice(0, 10),
): Wedding {
  if (wedding.packageName === pkg.name && wedding.price === pkg.price) {
    return wedding
  }

  const additional = wedding.deliverables.filter((d) => d.source === 'additional')
  const fromPackage: WeddingDeliverable[] = createWeddingDeliverablesFromPackage(
    wedding.id,
    pkg,
  )

  const timelineEntry: WeddingTimelineEntry = {
    id: `tl-${wedding.id}-pkg-${Date.now()}`,
    title: 'Para zmieniła pakiet.',
    date: changedAt,
    description: `${wedding.packageName} → ${pkg.name}`,
    type: 'package_changed',
  }

  return {
    ...wedding,
    packageName: pkg.name,
    price: pkg.price,
    accentColor: pkg.color,
    deliverables: [...fromPackage, ...additional],
    timeline: [timelineEntry, ...wedding.timeline],
  }
}
