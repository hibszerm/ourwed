import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { weddingService } from '@/lib/api/weddingService'

export function useWedding(id: string) {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: ['weddings', userId, id],
    queryFn: () => weddingService.getById(id),
    enabled: Boolean(userId && id),
  })
}
