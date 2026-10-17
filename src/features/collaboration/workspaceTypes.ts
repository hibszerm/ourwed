export type WorkspaceOwnershipKind = 'owned' | 'shared'
export type WorkspaceScope = 'all' | 'owned' | 'shared'
export type WorkspaceCapabilityLevel = 'view' | 'edit'

export interface WorkspaceCapability {
  key: string
  level: WorkspaceCapabilityLevel
}

/** Safe, canonical identity projection returned by list_my_workspace_weddings. */
export interface WorkspaceWedding {
  wedding_id: string
  ownership_kind: WorkspaceOwnershipKind
  couple_first_name: string | null
  couple_second_name: string | null
  wedding_date: string | null
  owner_display_name: string | null
  membership_id: string | null
  /** PostgreSQL bigint values are represented as strings to preserve precision. */
  access_version: string | null
  permission_group_mapping_version: '1' | '2' | '3' | null
  effective_capabilities: WorkspaceCapability[]
}

export interface WorkspaceWeddingDisplayName {
  wedding_id: string
  owner_canonical_display_name: string
  effective_display_name: string
  has_personal_override: boolean
}

export interface WorkspaceCursor {
  weddingDate: string | null
  weddingId: string
}
