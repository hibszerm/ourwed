import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { dashboardService } from '@/lib/api/dashboardService'

/**
 * Dashboard-only nearest active delivery deadlines list.
 * One light query, persisted due date only, no wedding hydration.
 */
export function useNearestDeliveryDeadlines() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: ['dashboard', 'delivery-deadlines', userId],
    queryFn: () => dashboardService.getNearestDeliveryDeadlines(),
    enabled: Boolean(userId),
  })
}
