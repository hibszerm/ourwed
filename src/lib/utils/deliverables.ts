import type { Package, PackageDeliverable } from '@/types/package'
import type { WeddingDeliverable } from '@/types/wedding'

export function createWeddingDeliverableFromPackage(
  weddingId: string,
  template: PackageDeliverable,
): WeddingDeliverable {
  return {
    id: `wd-${weddingId}-${template.id}`,
    name: template.name,
    source: 'package',
    packageDeliverableId: template.id,
    completed: false,
  }
}

export function createWeddingDeliverablesFromPackage(
  weddingId: string,
  pkg: Package,
): WeddingDeliverable[] {
  return pkg.deliverables.map((template) =>
    createWeddingDeliverableFromPackage(weddingId, template),
  )
}

export function createAdditionalDeliverable(
  weddingId: string,
  name: string,
  suffix = Date.now().toString(),
): WeddingDeliverable {
  return {
    id: `wd-${weddingId}-add-${suffix}`,
    name,
    source: 'additional',
    completed: false,
  }
}

export function appendAdditionalDeliverable(
  deliverables: WeddingDeliverable[],
  weddingId: string,
  name: string,
): WeddingDeliverable[] {
  return [...deliverables, createAdditionalDeliverable(weddingId, name)]
}
