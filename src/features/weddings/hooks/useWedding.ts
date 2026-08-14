import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { weddingService } from '@/lib/api/weddingService'
import type { Wedding } from '@/types/wedding'

export function useWedding(id: string) {
  const { user } = useAuth()
  const userId = user?.id
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['weddings', userId, id],
    queryFn: () => weddingService.getById(id),
    enabled: Boolean(userId && id),
    // List hydrate matches detail shape (same finalizeWeddingView path).
    // Used only as placeholder — detail query still refines authoritative data.
    placeholderData: () => {
      const list = queryClient.getQueryData<Wedding[]>(['weddings', userId])
      return list?.find((w) => w.id === id)
    },
  })
}
