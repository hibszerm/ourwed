export function weddingBriefQueryKey(
  weddingId: string,
): readonly ['wedding-brief', string] {
  return ['wedding-brief', weddingId] as const
}

export function weddingBriefSourceQueryKey(
  weddingId: string,
): readonly ['wedding-brief-source', string] {
  return ['wedding-brief-source', weddingId] as const
}

/**
 * React Query roots whose updates can change Brief-relevant source data.
 * Used to refetch the source hash without scattering invalidateBrief()
 * across wedding mutations.
 */
export const BRIEF_SOURCE_CACHE_ROOTS = new Set<string>([
  'weddings',
  'wedding-places',
  'contacts',
  'wedding-extras',
  'sessions',
  'operational-times',
  'travel-plan',
  'prewedding-questionnaire',
  'prewedding-response',
  'notes',
])
