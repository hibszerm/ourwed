import type { CollaborationAccessMode, CollaborationAreaAccess } from './areaAccessV3'
import type { CollaborationRoleKeyV1 } from './roleCatalog.v1'

/** Legacy v1 type retained only by historical acceptance fixtures. */
export interface CustomCapabilityGrant {
  capability_key: 'wedding.identity' | 'places.address' | 'schedule.operational_time'
  level: 1 | 2
}

export interface CollaborationAccessManagementDto {
  wedding_id: string
  membership_id?: string
  invitation_id?: string
  status: 'active' | 'pending'
  role_key: CollaborationRoleKeyV1
  custom_role_label: string | null
  access_mode: CollaborationAccessMode
  access_version?: string
  configuration_revision?: string
  mapping_version: '3'
  configured_areas: CollaborationAreaAccess
  effective_areas: CollaborationAreaAccess
}
