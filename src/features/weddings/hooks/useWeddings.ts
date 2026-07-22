import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { weddingService } from '@/lib/api/weddingService'

export function useWeddings() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: ['weddings', userId],
    queryFn: () => weddingService.getAll(),
    enabled: Boolean(userId),
  })
}
