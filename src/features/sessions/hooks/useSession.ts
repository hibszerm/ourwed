import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { sessionService } from '@/lib/api/sessionService'

export function useSession(id: string) {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: ['sessions', userId, id],
    queryFn: () => sessionService.getById(id),
    enabled: Boolean(userId && id),
  })
}
