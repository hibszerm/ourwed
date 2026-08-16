import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { weddingListLightService } from '@/lib/api/weddingListLightService'

/** List cache — still under `weddings` prefix so invalidateQueries(['weddings']) works. */
export function weddingsListQueryKey(userId: string | undefined) {
  return ['weddings', 'list', userId] as const
}

const WEDDINGS_LIST_STALE_MS = 1000 * 60 * 5

export function useWeddings() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: weddingsListQueryKey(userId),
    queryFn: () => weddingListLightService.listWeddingsForList(),
    enabled: Boolean(userId),
    staleTime: WEDDINGS_LIST_STALE_MS,
  })
}
