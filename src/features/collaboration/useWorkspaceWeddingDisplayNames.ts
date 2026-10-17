import { useQuery } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { workspaceService } from './workspaceService'
import type { WorkspaceWeddingDisplayName } from './workspaceTypes'

export function workspaceWeddingDisplayNamesQueryKey(
  userId: string | undefined,
  weddingIds: readonly string[],
) {
  return [
    'workspace-wedding-display-names',
    userId ?? null,
    [...new Set(weddingIds)].sort(),
  ] as const
}

export function workspaceWeddingDisplayNamesQueryPrefix(userId: string | undefined) {
  return ['workspace-wedding-display-names', userId ?? null] as const
}

export function updateWorkspaceWeddingDisplayNameCaches(
  queryClient: QueryClient,
  userId: string | undefined,
  next: WorkspaceWeddingDisplayName,
) {
  queryClient.setQueriesData<WorkspaceWeddingDisplayName[]>(
    { queryKey: workspaceWeddingDisplayNamesQueryPrefix(userId) },
    (current) => current?.map((item) => item.wedding_id === next.wedding_id ? next : item),
  )
}

export function useWorkspaceWeddingDisplayNames(
  weddingIds: readonly string[],
  userId: string | undefined,
  enabled = true,
) {
  const stableIds = [...new Set(weddingIds)].sort()

  return useQuery({
    queryKey: workspaceWeddingDisplayNamesQueryKey(userId, stableIds),
    queryFn: () => workspaceService.getDisplayNames(stableIds),
    enabled: enabled && Boolean(userId && stableIds.length),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  })
}
