import type { CustomCapabilityGrant } from './accessManagementTypes'

export type CollaborationPermissionPresetScope = 'system' | 'user'

export interface CollaborationPermissionPresetListItem {
  preset_id: string
  scope: CollaborationPermissionPresetScope
  name: string
  description: string | null
  version: string
  updated_at: string
}

export interface CollaborationPermissionPreset extends CollaborationPermissionPresetListItem {
  permission_group_mapping_version: '1'
  grants: CustomCapabilityGrant[]
  created_at: string
}

export interface PermissionPresetInput {
  name: string
  description: string | null
  grants: CustomCapabilityGrant[]
}
