import { TASKS_QUERY_ROOT } from '@/lib/api/taskService'

export function studioTasksQueryKey(userId: string | undefined) {
  return [TASKS_QUERY_ROOT, 'studio', userId] as const
}

export function weddingTasksQueryKey(
  userId: string | undefined,
  weddingId: string,
) {
  return [TASKS_QUERY_ROOT, 'wedding', userId, weddingId] as const
}

/** Dashboard due tasks — overdue through endDate (shared task domain root). */
export function dashboardDueTasksQueryKey(
  userId: string | undefined,
  endDate: string,
) {
  return [TASKS_QUERY_ROOT, 'dashboard-due', userId, endDate] as const
}

/** Light active-wedding options for the Tasks Center form. */
export function taskWeddingOptionsQueryKey(userId: string | undefined) {
  return [TASKS_QUERY_ROOT, 'wedding-options', userId] as const
}
