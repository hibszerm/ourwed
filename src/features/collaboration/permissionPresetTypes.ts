import type { CollaborationAreaAccess } from './areaAccessV3'

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
  mapping_version: '3'
  areas: CollaborationAreaAccess
  created_at: string
}

export interface PermissionPresetInput {
  name: string
  description: string | null
  areas: CollaborationAreaAccess
}
