import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWeddings } from '@/features/weddings/hooks/useWeddings'
import { workspaceService } from '@/features/collaboration/workspaceService'
import type { WorkspaceCursor, WorkspaceWedding } from '@/features/collaboration/workspaceTypes'
import {
  composeWorkspaceWeddingRows,
  workspaceVisibleQueryKey,
} from './workspaceWeddings'

const WORKSPACE_PAGE_SIZE = 50
const WORKSPACE_STALE_MS = 1000 * 60 * 5

type WorkspacePageFetcher = (args: {
  scope: 'all'
  after: WorkspaceCursor | null
  limit: number
}) => Promise<WorkspaceWedding[]>

export async function listAllVisibleWorkspaceRows(
  fetchPage: WorkspacePageFetcher = (args) => workspaceService.listWeddings(args),
): Promise<WorkspaceWedding[]> {
  const result: WorkspaceWedding[] = []
  let after: WorkspaceCursor | null = null

  for (;;) {
    const page = await fetchPage({
      scope: 'all',
      after,
      limit: WORKSPACE_PAGE_SIZE,
    })
    result.push(...page)
    if (page.length < WORKSPACE_PAGE_SIZE) return result

    const last = page[page.length - 1]
    if (!last) return result
    const next = { weddingDate: last.wedding_date, weddingId: last.wedding_id }
    if (
      after?.weddingDate === next.weddingDate
      && after.weddingId === next.weddingId
    ) {
      throw new Error('Workspace data could not be loaded.')
    }
    after = next
  }
}

export function useUnifiedWeddingsWorkspace() {
  const { user } = useAuth()
  const userId = user?.id
  const workspaceQuery = useQuery({
    queryKey: workspaceVisibleQueryKey(userId),
    queryFn: () => listAllVisibleWorkspaceRows(),
    enabled: Boolean(userId),
    staleTime: WORKSPACE_STALE_MS,
  })
  // This existing path is owner-scoped by auth.uid(). Its returned rows are
  // joined only to IDs that H1 identifies as owned; shared IDs never enter it.
  const ownerQuery = useWeddings()
  const composition = useMemo(() => {
    if (!workspaceQuery.data || !ownerQuery.data) return null
    try {
      return { data: composeWorkspaceWeddingRows(workspaceQuery.data, ownerQuery.data), error: null }
    } catch (error) {
      return { data: null, error }
    }
  }, [workspaceQuery.data, ownerQuery.data])

  return {
    data: composition?.data ?? undefined,
    isLoading: workspaceQuery.isPending || ownerQuery.isPending,
    isError: workspaceQuery.isError || ownerQuery.isError || Boolean(composition?.error),
    error: workspaceQuery.error ?? ownerQuery.error ?? composition?.error ?? null,
    refetch: async () => Promise.all([workspaceQuery.refetch(), ownerQuery.refetch()]),
  }
}
