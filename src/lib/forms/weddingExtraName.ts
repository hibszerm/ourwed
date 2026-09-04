/**
 * Display name for a wedding extra service.
 * Prefer the frozen name_snapshot; never invent a live catalog rename.
 */
export function resolveWeddingExtraDisplayName(extra: {
  nameSnapshot?: string | null
  name?: string | null
}): string {
  const snapshot = extra.nameSnapshot?.trim()
  if (snapshot) return snapshot
  return extra.name?.trim() || 'Usługa'
}
