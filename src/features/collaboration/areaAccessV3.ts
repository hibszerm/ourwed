export const COLLABORATION_AREA_KEYS = [
  'logistics',
  'prewedding',
  'contacts',
  'tasks',
  'notes',
  'compensation',
] as const

export type CollaborationAreaKey = (typeof COLLABORATION_AREA_KEYS)[number]
export type CollaborationAreaLevel = 0 | 1 | 2
export type CollaborationAccessMode = 'viewer' | 'editor' | 'custom'
export type CollaborationAreaAccess = Readonly<Record<CollaborationAreaKey, CollaborationAreaLevel>>

export const COLLABORATION_AREA_OPTIONS: ReadonlyArray<{
  key: CollaborationAreaKey
  label: string
}> = [
  { key: 'logistics', label: 'Logistyka' },
  { key: 'prewedding', label: 'Ankieta przedślubna' },
  { key: 'contacts', label: 'Kontakty' },
  { key: 'tasks', label: 'Zadania' },
  { key: 'notes', label: 'Notatki' },
  { key: 'compensation', label: 'Rozliczenie' },
]

export const VIEWER_AREA_DEFAULTS: CollaborationAreaAccess = {
  logistics: 1, prewedding: 1, contacts: 1, tasks: 1, notes: 1, compensation: 0,
}
export const EDITOR_AREA_DEFAULTS: CollaborationAreaAccess = {
  logistics: 2, prewedding: 2, contacts: 2, tasks: 2, notes: 2, compensation: 0,
}

export function parseAreaAccess(value: unknown): CollaborationAreaAccess {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AREA_ACCESS_INVALID')
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== COLLABORATION_AREA_KEYS.length
    || keys.some((key) => !COLLABORATION_AREA_KEYS.includes(key as CollaborationAreaKey))) {
    throw new Error('AREA_ACCESS_INVALID')
  }
  const parsed = {} as Record<CollaborationAreaKey, CollaborationAreaLevel>
  for (const key of COLLABORATION_AREA_KEYS) {
    const level = record[key]
    if (level !== 0 && level !== 1 && level !== 2) throw new Error('AREA_ACCESS_INVALID')
    parsed[key] = level
  }
  return parsed
}

export function areaDefaultsForMode(mode: CollaborationAccessMode): CollaborationAreaAccess | null {
  if (mode === 'viewer') return { ...VIEWER_AREA_DEFAULTS }
  if (mode === 'editor') return { ...EDITOR_AREA_DEFAULTS }
  return null
}

export type V3WeddingAuthority =
  | { kind: 'owned'; weddingId: string; mappingVersion: '3'; configuredAreas: CollaborationAreaAccess; effectiveAreas: CollaborationAreaAccess }
  | { kind: 'shared'; weddingId: string; membershipId: string; accessVersion: string; mappingVersion: '3';
      roleKey: string; customRoleLabel: string | null; accessMode: CollaborationAccessMode;
      configuredAreas: CollaborationAreaAccess; effectiveAreas: CollaborationAreaAccess }
  | { kind: 'unavailable' }

export function getEffectiveAreaLevel(
  authority: V3WeddingAuthority | undefined,
  area: CollaborationAreaKey,
): CollaborationAreaLevel {
  if (!authority || authority.kind === 'unavailable') return 0
  return authority.effectiveAreas[area]
}
