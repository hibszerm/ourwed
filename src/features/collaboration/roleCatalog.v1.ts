export const COLLABORATION_ROLE_CATALOG_V1 = [
  { key: 'unspecified', label: 'Nie określono' },
  { key: 'system:photographer', label: 'Fotograf' },
  { key: 'system:filmmaker', label: 'Filmowiec' },
  { key: 'system:second_shooter', label: 'Second shooter' },
  { key: 'system:wedding_planner', label: 'Wedding planner' },
  { key: 'system:assistant', label: 'Asystent' },
  { key: 'system:content_creator', label: 'Content creator' },
  { key: 'custom', label: 'Inna rola' },
] as const

export type CollaborationRoleKeyV1 = (typeof COLLABORATION_ROLE_CATALOG_V1)[number]['key']
export type CollaborationAccessModeV1 = 'viewer' | 'editor' | 'custom'
