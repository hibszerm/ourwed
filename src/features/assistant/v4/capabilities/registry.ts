/**
 * V4 Capability Registry — closed product capability allowlist.
 * Phase 3D: finance + places + day_plan + collection.query.
 */

import { collectionQueryCapability } from './collection/collectionQueryCapability'
import { weddingDayPlanGetCapability } from './dayPlan/weddingDayPlanCapability'
import { weddingFinanceGetCapability } from './finance/weddingFinanceCapability'
import { weddingPlacesGetCapability } from './places/weddingPlacesCapability'
import type { CapabilityDefinition, V4CapabilityId } from './types'
import { V4_CAPABILITY_IDS } from './types'

export const V4_CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  weddingFinanceGetCapability,
  weddingPlacesGetCapability,
  weddingDayPlanGetCapability,
  collectionQueryCapability,
]

export function getV4Capability(
  id: V4CapabilityId,
): CapabilityDefinition | null {
  return V4_CAPABILITY_REGISTRY.find((c) => c.id === id) ?? null
}

export function assertUniqueCapabilityIds(
  capabilities: readonly CapabilityDefinition[] = V4_CAPABILITY_REGISTRY,
): void {
  const seen = new Set<string>()
  for (const cap of capabilities) {
    if (seen.has(cap.id)) {
      throw new Error(`Duplicate capability id: ${cap.id}`)
    }
    seen.add(cap.id)
    if (!(V4_CAPABILITY_IDS as readonly string[]).includes(cap.id)) {
      throw new Error(`Capability id not in closed set: ${cap.id}`)
    }
  }
}

assertUniqueCapabilityIds()
