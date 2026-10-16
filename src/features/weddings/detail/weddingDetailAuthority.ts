import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { collaborativeWeddingQueryKeys } from '@/features/collaboration/useCollaborativeWeddings'
import { collaborativeWeddingIdentityQueryKey } from '@/features/collaboration/useCollaborativeWeddingIdentity'
import { weddingTasksQueryKey } from '@/features/tasks/tasksQueryKeys'
import { operationalTimesQueryKey } from '@/features/wedding-day/queryKeys'
import { travelPlanQueryKey, weddingPlacesQueryKey } from '@/features/wedding-day/travelPlanPlaces'
import { supabase } from '@/lib/supabase'
import { isUuid } from '@/features/collaboration/collaborativeWeddingTypes'

export type WeddingDetailAuthority =
  | { kind: 'owned'; weddingId: string }
  | {
      kind: 'shared'
      weddingId: string
      membershipId: string
      accessVersion: string
      mappingVersion: '1' | '2'
      effectiveCapabilities: Record<string, 0 | 1 | 2>
    }
  | { kind: 'unavailable' }

export const weddingDetailAuthorityQueryKey = (
  userId: string | undefined,
  weddingId: string,
) => ['wedding-detail-authority', userId, weddingId] as const

function parseAuthority(value: unknown, requestedWeddingId: string): WeddingDetailAuthority {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error('AUTHORITY_RESPONSE_INVALID')
    value = value[0]
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AUTHORITY_RESPONSE_INVALID')
  }
  const row = value as Record<string, unknown>
  if (row.kind === 'unavailable') return { kind: 'unavailable' }
  if (typeof row.wedding_id !== 'string'
    || row.wedding_id.toLowerCase() !== requestedWeddingId.toLowerCase()) {
    throw new Error('AUTHORITY_RESPONSE_INVALID')
  }
  if (row.kind === 'owned') return { kind: 'owned', weddingId: requestedWeddingId }
  if (row.kind !== 'shared' || typeof row.membership_id !== 'string'
    || typeof row.access_version !== 'string' || typeof row.mapping_version !== 'string'
    || (row.mapping_version !== '1' && row.mapping_version !== '2')
    || !row.effective_capabilities || typeof row.effective_capabilities !== 'object'
    || Array.isArray(row.effective_capabilities)) {
    throw new Error('AUTHORITY_RESPONSE_INVALID')
  }
  const effectiveCapabilities: Record<string, 0 | 1 | 2> = {}
  for (const [key, level] of Object.entries(row.effective_capabilities as Record<string, unknown>)) {
    if (level !== 0 && level !== 1 && level !== 2) throw new Error('AUTHORITY_RESPONSE_INVALID')
    effectiveCapabilities[key] = level
  }
  if ((effectiveCapabilities['wedding.identity'] ?? 0) < 1) {
    return { kind: 'unavailable' }
  }
  return {
    kind: 'shared',
    weddingId: requestedWeddingId,
    membershipId: row.membership_id,
    accessVersion: row.access_version,
    mappingVersion: row.mapping_version,
    effectiveCapabilities,
  }
}

export async function resolveWeddingDetailAuthority(weddingId: string): Promise<WeddingDetailAuthority> {
  if (!isUuid(weddingId)) return { kind: 'unavailable' }
  const { data, error } = await supabase.rpc('resolve_my_wedding_detail_authority', {
    p_wedding_id: weddingId,
  })
  if (error) throw error
  return parseAuthority(data, weddingId)
}

export function useWeddingDetailAuthority(weddingId: string) {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: weddingDetailAuthorityQueryKey(userId, weddingId),
    queryFn: () => resolveWeddingDetailAuthority(weddingId),
    enabled: Boolean(userId && isUuid(weddingId)),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  })
}

function removeQueriesWithKeys(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: readonly (readonly unknown[])[],
) {
  for (const queryKey of keys) queryClient.removeQueries({ queryKey, exact: true })
}

/** Remove owner domain caches when this actor resolves only shared/no authority. */
export function useEvictIncompatibleWeddingDetailCaches(
  userId: string | undefined,
  weddingId: string,
  authority: WeddingDetailAuthority | undefined,
) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!userId || !weddingId || authority?.kind === 'owned' || !authority) return
    removeQueriesWithKeys(queryClient, [
      ['weddings', userId, weddingId],
      weddingTasksQueryKey(userId, weddingId),
      ['contacts', userId, weddingId],
      ['wedding-extras', userId, weddingId],
      ['wedding-places', userId, weddingId],
      weddingPlacesQueryKey(userId, weddingId),
      operationalTimesQueryKey(userId, weddingId),
      ['prewedding-questionnaire', weddingId],
      ['package-contract-for-wedding', weddingId],
      travelPlanQueryKey(userId, weddingId),
      ['generated-wedding-contracts', weddingId],
      ['wedding-contract-package-snapshots', weddingId],
      ['wedding-source-contracts', weddingId],
    ])
    if (authority.kind === 'unavailable') {
      queryClient.removeQueries({
        queryKey: collaborativeWeddingIdentityQueryKey(userId, weddingId),
        exact: true,
      })
      queryClient.removeQueries({
        queryKey: collaborativeWeddingQueryKeys.detail(userId, weddingId),
        exact: true,
      })
      queryClient.removeQueries({
        queryKey: collaborativeWeddingQueryKeys.editState(userId, weddingId),
        exact: true,
      })
    }
  }, [authority, queryClient, userId, weddingId])
}
