import type { CollaborationAccessModeV1, CollaborationRoleKeyV1 } from './roleCatalog.v1'

export interface CustomCapabilityGrant {
  capability_key: 'wedding.identity' | 'places.address' | 'schedule.operational_time'
  level: 1 | 2
}

export interface CollaborationAccessManagementDto {
  wedding_id: string
  membership_id?: string
  invitation_id?: string
  status: 'active' | 'pending'
  collaborator_display_name?: string
  invitee_display_name?: string
  role_key: CollaborationRoleKeyV1
  custom_role_label: string | null
  access_mode: CollaborationAccessModeV1
  access_version?: string
  configuration_revision?: string
  access_configuration_version?: 0 | 1
  effective_permissions?: CustomCapabilityGrant[]
  effective_preview?: CustomCapabilityGrant[]
  custom_grants: CustomCapabilityGrant[]
  viewer_preview: CustomCapabilityGrant[]
  editor_preview: CustomCapabilityGrant[]
  permission_group_mapping_version: '1'
}
