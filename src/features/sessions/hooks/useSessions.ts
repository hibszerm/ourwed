import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { sessionService } from '@/lib/api/sessionService'

export function useSessions() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: ['sessions', userId],
    queryFn: () => sessionService.getAll(),
    enabled: Boolean(userId),
  })
}
