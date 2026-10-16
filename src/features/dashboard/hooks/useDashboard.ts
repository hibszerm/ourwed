import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { dashboardDueTasksQueryKey, dashboardSharedDueTasksQueryKey } from '@/features/tasks/tasksQueryKeys'
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

  const owned = useQuery({
    queryKey: dashboardDueTasksQueryKey(userId, resolvedEnd),
    queryFn: () => dashboardService.getOwnedDueTasks(resolvedEnd),
    enabled: Boolean(userId),
    placeholderData: keepPreviousData,
  })
  const shared = useQuery({
    queryKey: dashboardSharedDueTasksQueryKey(userId, resolvedEnd),
    queryFn: () => dashboardService.getSharedDueTasks(resolvedEnd),
    enabled: Boolean(userId), staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    // Existing shared-task RPC returns the current effective read authority. Keep
    // foreground screens bounded without background polling on hidden tabs.
    refetchInterval: 30_000, refetchIntervalInBackground: false,
  })
  const data = useMemo(() => owned.data || shared.data
    ? { todayTasks: [...(owned.data ?? []), ...(shared.data ?? [])] }
    : undefined, [owned.data, shared.data])
  return {
    data, isError: owned.isError || shared.isError,
    isLoading: owned.isLoading || shared.isLoading,
    refetch: async () => { await Promise.all([owned.refetch(), shared.refetch()]) },
  }
}
