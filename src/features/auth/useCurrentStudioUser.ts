import { useQuery } from '@tanstack/react-query'
import { getCurrentStudioUser } from '@/lib/api/studioUser'

export function useCurrentStudioUser() {
  return useQuery({
    queryKey: ['current-studio-user'],
    queryFn: getCurrentStudioUser,
    staleTime: 60_000,
  })
}

