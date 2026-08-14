import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useStudioAuthId } from '@/features/auth/useStudioAuthId'
import { questionnaireService } from '@/lib/api/questionnaireService'

/** Canonical React Query key prefix for pending contract lead questionnaires. */
export const PENDING_QUESTIONNAIRES_KEY = 'pending-questionnaires' as const

export function pendingQuestionnairesQueryKey(
  userId: string | null | undefined,
) {
  return [PENDING_QUESTIONNAIRES_KEY, userId] as const
}

/**
 * Shared pending-leads query for Dashboard card + `/oczekujace`.
 * Fresh on every mount / focus — public submits cannot invalidate this cache.
 */
export function usePendingQuestionnaires() {
  const userId = useStudioAuthId()

  return useQuery({
    queryKey: pendingQuestionnairesQueryKey(userId),
    queryFn: () => questionnaireService.listPending(),
    enabled: Boolean(userId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
}

/** Fire-and-forget cache invalidation after approve/reject — must not block navigation. */
export function invalidateAfterQuestionnaireApproval(
  queryClient: QueryClient,
): void {
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: [PENDING_QUESTIONNAIRES_KEY] }),
    queryClient.invalidateQueries({ queryKey: ['questionnaires'] }),
    queryClient.invalidateQueries({ queryKey: ['weddings'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ]).catch((err) => {
    console.warn(
      '[pending-questionnaires] invalidation failed:',
      err instanceof Error ? err.message : err,
    )
  })
}

export function invalidateAfterQuestionnaireReject(
  queryClient: QueryClient,
): void {
  void Promise.all([
    queryClient.invalidateQueries({ queryKey: [PENDING_QUESTIONNAIRES_KEY] }),
    queryClient.invalidateQueries({ queryKey: ['questionnaires'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ]).catch((err) => {
    console.warn(
      '[pending-questionnaires] reject invalidation failed:',
      err instanceof Error ? err.message : err,
    )
  })
}

export function useInvalidateAfterQuestionnaireMutation() {
  const queryClient = useQueryClient()
  return {
    afterApprove: () => invalidateAfterQuestionnaireApproval(queryClient),
    afterReject: () => invalidateAfterQuestionnaireReject(queryClient),
  }
}
