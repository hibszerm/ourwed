import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { dashboardService } from '@/lib/api/dashboardService'

/**
 * Dashboard-only light weddings + sessions for assignment cards.
 * Must NOT call the heavy full-wedding list / finalize hydrate path.
 */
export function useDashboardAssignments() {
  const { user } = useAuth()
  const userId = user?.id

  return useQuery({
    queryKey: ['dashboard', 'assignments', userId],
    queryFn: () => dashboardService.getAssignmentLists(),
    enabled: Boolean(userId),
  })
}
