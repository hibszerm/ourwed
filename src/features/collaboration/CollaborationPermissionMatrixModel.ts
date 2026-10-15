import type { CustomCapabilityGrant } from './accessManagementTypes'

export const ACTIVE_PERMISSION_GROUPS = [
  { key: 'basic-information', label: 'Podstawowe informacje', capabilities: ['wedding.identity'] as const, levels: [0, 1] as const },
  { key: 'places-and-times', label: 'Miejsca i godziny', capabilities: ['places.address', 'schedule.operational_time'] as const, levels: [0, 1, 2] as const },
] as const

export function replacePermissionGroup(
  grants: CustomCapabilityGrant[], capabilities: readonly string[], level: number,
): CustomCapabilityGrant[] {
  const keys = new Set(capabilities)
  const retained = grants.filter((grant) => !keys.has(grant.capability_key))
  const replacement = level === 0 ? [] : capabilities.map((capability_key) => ({
    capability_key: capability_key as CustomCapabilityGrant['capability_key'], level: level as 1 | 2,
  }))
  return [...retained, ...replacement].sort((a, b) => a.capability_key.localeCompare(b.capability_key))
}
