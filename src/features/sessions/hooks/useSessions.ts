import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { sessionListLightService } from '@/lib/api/sessionListLightService'

/** List cache — still under `sessions` prefix so invalidateQueries(['sessions']) works. */
export function sessionsListQueryKey(userId: string | undefined) {
  return ['sessions', 'list', userId] as const
}

const SESSIONS_LIST_STALE_MS = 1000 * 60 * 5

export function useSessions() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: sessionsListQueryKey(userId),
    queryFn: () => sessionListLightService.listSessionsForList(),
    enabled: Boolean(userId),
    staleTime: SESSIONS_LIST_STALE_MS,
  })
}
