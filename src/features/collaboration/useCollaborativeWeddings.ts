import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { collaborativeWeddingService } from './collaborativeWeddingService'
import {
  COLLABORATIVE_WEDDING_PAGE_SIZE,
  type CollaborativeWeddingCursor,
} from './collaborativeWeddingTypes'

export const collaborativeWeddingQueryKeys = {
  list: (userId: string | undefined) => ['collaboration', 'weddings', userId] as const,
  detail: (userId: string | undefined, weddingId: string) =>
    ['collaboration', 'wedding', userId, weddingId] as const,
}

export function clearCollaborativeWeddingAccess(
  queryClient: QueryClient,
  userId: string | undefined,
  weddingId: string,
) {
  queryClient.removeQueries({ queryKey: collaborativeWeddingQueryKeys.detail(userId, weddingId), exact: true })
  queryClient.removeQueries({ queryKey: collaborativeWeddingQueryKeys.list(userId), exact: true })
}

const freshness = {
  staleTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: true,
  retry: false as const,
}

const initialCursor: CollaborativeWeddingCursor = {
  afterWeddingDate: null,
  afterWeddingId: null,
}

export function useCollaborativeWeddings() {
  const { user } = useAuth()
  const userId = user?.id

  return useInfiniteQuery({
    queryKey: collaborativeWeddingQueryKeys.list(userId),
    queryFn: ({ pageParam }) => collaborativeWeddingService.listCollaborativeWeddings(pageParam),
    initialPageParam: initialCursor,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < COLLABORATIVE_WEDDING_PAGE_SIZE) return undefined
      const last = lastPage[lastPage.length - 1]
      if (!last) return undefined
      return { afterWeddingDate: last.wedding_date, afterWeddingId: last.wedding_id }
    },
    enabled: Boolean(userId),
    ...freshness,
  })
}

export function useCollaborativeWedding(weddingId: string, enabled = true) {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: collaborativeWeddingQueryKeys.detail(userId, weddingId),
    queryFn: () => collaborativeWeddingService.getCollaborativeWeddingDetail(weddingId),
    enabled: Boolean(userId && weddingId && enabled),
    ...freshness,
  })
}
