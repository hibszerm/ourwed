import { TASKS_QUERY_ROOT } from '@/lib/api/taskService'

export function studioTasksQueryKey(userId: string | undefined) {
  return [TASKS_QUERY_ROOT, 'studio-owner', userId] as const
}

export function collaborativeStudioTasksQueryKey(userId: string | undefined) {
  return [TASKS_QUERY_ROOT, 'collaborative-global', userId] as const
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
  return [TASKS_QUERY_ROOT, 'dashboard-due-owner', userId, endDate] as const
}

export function dashboardSharedDueTasksQueryKey(
  userId: string | undefined,
  endDate: string,
) {
  return [TASKS_QUERY_ROOT, 'dashboard-due-shared', userId, endDate] as const
}

/** Light active-wedding options for the Tasks Center form. */
export function taskWeddingOptionsQueryKey(userId: string | undefined) {
  return [TASKS_QUERY_ROOT, 'wedding-options', userId] as const
}
