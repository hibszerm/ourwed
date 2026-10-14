/**
 * Versioned presentation mapping for future permission-management UX.
 * Server-side membership grants and the capability registry remain the
 * authorization authority. Changes to this map require a new mapping version.
 */
export const PERMISSION_GROUP_MAPPING_VERSION = '1' as const

export const PERMISSION_GROUP_MAPPING_V1 = {
  basic_information: ['wedding.identity'],
  places_and_times: ['places.address', 'schedule.operational_time'],
  schedule: ['schedule.timeline', 'schedule.completion'],
  brief: ['brief.curated'],
  tasks: ['tasks'],
  notes: ['notes'],
  travel_plan: ['travel.route'],
} as const

export type PermissionGroupKeyV1 = keyof typeof PERMISSION_GROUP_MAPPING_V1
export type CapabilityKeyV1 = (typeof PERMISSION_GROUP_MAPPING_V1)[PermissionGroupKeyV1][number]
