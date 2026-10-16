import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { isUuid } from './collaborativeWeddingTypes'
import { collaborativeWeddingIdentityService } from './collaborativeWeddingIdentityService'

export const collaborativeWeddingIdentityQueryKey = (
  userId: string | undefined,
  weddingId: string,
) => ['collaborative-wedding-identity', userId, weddingId] as const

export function useCollaborativeWeddingIdentity(weddingId: string, userId: string | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: collaborativeWeddingIdentityQueryKey(userId, weddingId),
    queryFn: () => collaborativeWeddingIdentityService.getIdentity(weddingId),
    enabled: Boolean(userId && isUuid(weddingId)),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: false,
  })

  useEffect(() => {
    if (query.isSuccess && query.data === null) {
      void queryClient.invalidateQueries({
        queryKey: ['wedding-detail-authority', userId, weddingId],
        exact: true,
      })
    }
  }, [query.data, query.isSuccess, queryClient, userId, weddingId])

  return query
}
