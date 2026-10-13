import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { collaborativeWeddingService } from './collaborativeWeddingService'
import {
  collaborativeOperationalService,
  isCollaborationError,
} from './collaborativeOperationalService'
import {
  COLLABORATIVE_WEDDING_PAGE_SIZE,
  type CollaborativeWeddingCursor,
  type UpdateCollaborativeOperationalTimeInput,
  type UpdateCollaborativeWeddingPlaceInput,
} from './collaborativeWeddingTypes'

export const collaborativeWeddingQueryKeys = {
  list: (userId: string | undefined) => ['collaboration', 'weddings', userId] as const,
  detail: (userId: string | undefined, weddingId: string) =>
    ['collaboration', 'wedding', userId, weddingId] as const,
  editState: (userId: string | undefined, weddingId: string) =>
    ['collaboration', 'wedding-edit-state', userId, weddingId] as const,
}

export function clearCollaborativeWeddingAccess(
  queryClient: QueryClient,
  userId: string | undefined,
  weddingId: string,
) {
  queryClient.removeQueries({ queryKey: collaborativeWeddingQueryKeys.detail(userId, weddingId), exact: true })
  queryClient.removeQueries({ queryKey: collaborativeWeddingQueryKeys.editState(userId, weddingId), exact: true })
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

export function useCollaborativeWeddingOperationalEditState(weddingId: string, enabled = true) {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: collaborativeWeddingQueryKeys.editState(userId, weddingId),
    queryFn: () => collaborativeOperationalService.getEditState(weddingId),
    enabled: Boolean(userId && weddingId && enabled),
    ...freshness,
  })
}

function useOperationalMutationCallbacks() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id

  async function refreshWedding(weddingId: string) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: collaborativeWeddingQueryKeys.detail(userId, weddingId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: collaborativeWeddingQueryKeys.editState(userId, weddingId),
        exact: true,
      }),
    ])
  }

  async function handleError(error: unknown, weddingId: string) {
    if (isCollaborationError(error, 'UNAVAILABLE')) {
      clearCollaborativeWeddingAccess(queryClient, userId, weddingId)
      navigate('/wspolpraca/sluby', { replace: true, state: { accessEnded: true } })
    } else if (isCollaborationError(error, 'CONFLICT')) {
      await refreshWedding(weddingId)
    }
  }

  return { refreshWedding, handleError }
}

export function useUpdateCollaborativeWeddingPlace() {
  const { refreshWedding, handleError } = useOperationalMutationCallbacks()
  return useMutation({
    mutationFn: (input: UpdateCollaborativeWeddingPlaceInput) => collaborativeOperationalService.updatePlace(input),
    retry: false,
    onSuccess: (_result, input) => refreshWedding(input.weddingId),
    onError: (error, input) => handleError(error, input.weddingId),
  })
}

export function useUpdateCollaborativeOperationalTime() {
  const { refreshWedding, handleError } = useOperationalMutationCallbacks()
  return useMutation({
    mutationFn: (input: UpdateCollaborativeOperationalTimeInput) => collaborativeOperationalService.updateTime(input),
    retry: false,
    onSuccess: (_result, input) => refreshWedding(input.weddingId),
    onError: (error, input) => handleError(error, input.weddingId),
  })
}
