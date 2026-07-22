import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { dashboardService } from '@/lib/api/dashboardService'

export function useDashboard() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: ['dashboard', userId],
    queryFn: () => dashboardService.getDashboardData(),
    enabled: Boolean(userId),
  })
}
