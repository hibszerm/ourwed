import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { getCurrentStudioUser } from '@/lib/api/studioUser'

export function useCurrentStudioUser() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: ['current-studio-user', userId],
    queryFn: getCurrentStudioUser,
    enabled: Boolean(userId),
    staleTime: 60_000,
  })
}
