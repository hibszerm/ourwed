import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { dashboardDueTasksQueryKey } from '@/features/tasks/tasksQueryKeys'
import { dashboardService } from '@/lib/api/dashboardService'
import { localCalendarDateKey } from '@/lib/utils/localCalendarDate'

/**
 * Dashboard due-task query.
 * Pass a local endDate (YYYY-MM-DD) for horizon bounds; defaults to local today.
 */
export function useDashboard(endDate?: string) {
  const { user } = useAuth()
  const userId = user?.id
  const resolvedEnd = (endDate ?? localCalendarDateKey()).slice(0, 10)

  return useQuery({
    queryKey: dashboardDueTasksQueryKey(userId, resolvedEnd),
    queryFn: () => dashboardService.getDashboardData(resolvedEnd),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  })
}
