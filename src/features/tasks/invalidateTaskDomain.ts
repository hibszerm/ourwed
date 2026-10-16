import type { QueryClient } from '@tanstack/react-query'
import { TASKS_QUERY_ROOT, type StudioTask } from '@/lib/api/taskService'
import {
  collaborativeStudioTasksQueryKey,
  dashboardDueTasksQueryKey,
  dashboardSharedDueTasksQueryKey,
  studioTasksQueryKey,
  weddingTasksQueryKey,
} from '@/features/tasks/tasksQueryKeys'
import type { StudioTasksBundle } from '@/features/tasks/useStudioTasks'
import type { Task } from '@/types/wedding'

export type DashboardDueTasksData = Task[]

export type CollaborativeTaskErrorCode = 'CONFLICT' | 'FORBIDDEN' | 'UNAVAILABLE' | null

/** collaborativeTasksService normalizes RPC errors to these exact Error messages. */
export function collaborativeTaskErrorCode(error: unknown): CollaborativeTaskErrorCode {
  if (!(error instanceof Error)) return null
  return error.message === 'CONFLICT' || error.message === 'FORBIDDEN' || error.message === 'UNAVAILABLE'
    ? error.message
    : null
}

/** Reconcile only private collaborative task caches; owner task caches are untouched. */
export async function reconcileSharedTaskCaches(
  queryClient: QueryClient,
  userId: string | undefined,
  options: { weddingId?: string; outcome: 'CONFLICT' | 'FORBIDDEN' | 'UNAVAILABLE' },
) {
  const { weddingId, outcome } = options
  if (outcome === 'UNAVAILABLE') {
    await queryClient.cancelQueries({ queryKey: collaborativeStudioTasksQueryKey(userId) })
    await queryClient.cancelQueries({ queryKey: ['tasks', 'dashboard-due-shared', userId] })
    await queryClient.cancelQueries({ queryKey: ['collaborative-tasks-v3', userId] })
    queryClient.setQueriesData<StudioTasksBundle>(
      { queryKey: collaborativeStudioTasksQueryKey(userId) },
      (current) => {
        if (!current) return current
        const tasks = weddingId ? current.tasks.filter((task) => task.weddingId !== weddingId) : []
        const weddingById = new Map(current.weddingById)
        if (weddingId) weddingById.delete(weddingId)
        else weddingById.clear()
        return { tasks, weddingById }
      },
    )
    queryClient.setQueriesData<Task[]>(
      { queryKey: ['tasks', 'dashboard-due-shared', userId] },
      (current) => current ? (weddingId ? current.filter((task) => task.weddingId !== weddingId) : []) : current,
    )
    if (weddingId) {
      queryClient.setQueriesData({ queryKey: ['collaborative-tasks-v3', userId, weddingId] }, null)
    } else {
      queryClient.setQueriesData({ queryKey: ['collaborative-tasks-v3', userId] }, null)
    }
  }

  const sharedPredicates = [
    (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === 'tasks'
      && (q.queryKey[1] === 'collaborative-global' || q.queryKey[1] === 'dashboard-due-shared')
      && q.queryKey[2] === userId,
    (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === 'collaborative-tasks-v3'
      && q.queryKey[1] === userId && (!weddingId || q.queryKey[2] === weddingId),
  ]
  await Promise.all(sharedPredicates.map((predicate) => queryClient.invalidateQueries({ predicate, refetchType: 'all' })))
}

/**
 * Invalidate all task-domain consumers.
 * refetchType 'all' refreshes inactive Wedding Detail caches so linked tasks
 * appear after navigating from /zadania without waiting for a remount refetch race.
 * Also covers Dashboard Dzisiaj (`['tasks', 'dashboard-due', …]`).
 */
export async function invalidateTaskDomain(
  queryClient: QueryClient,
  options?: { weddingIds?: Array<string | null | undefined> },
) {
  const weddingIds = [
    ...new Set(
      (options?.weddingIds ?? []).filter(
        (id): id is string => Boolean(id && id.trim()),
      ),
    ),
  ]

  await queryClient.invalidateQueries({
    queryKey: [TASKS_QUERY_ROOT],
    refetchType: 'all',
  })

  // Explicit wedding keys (canonical + legacy WeddingDetailPage shape).
  for (const weddingId of weddingIds) {
    await queryClient.invalidateQueries({
      queryKey: [TASKS_QUERY_ROOT, 'wedding'],
      refetchType: 'all',
    })
    // Legacy: ['tasks', userId, weddingId] — still used until page fully migrated.
    await queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey
        return (
          Array.isArray(key) &&
          key[0] === TASKS_QUERY_ROOT &&
          key.length === 3 &&
          key[2] === weddingId
        )
      },
      refetchType: 'all',
    })
  }

  // Legacy Dashboard aggregate key (pre–1D.4 shared root).
  await queryClient.invalidateQueries({
    queryKey: ['dashboard'],
    refetchType: 'all',
  })
}

/** Optimistic remove from Dashboard due list for a specific horizon end date. */
export function removeDashboardDueTask(
  queryClient: QueryClient,
  userId: string | undefined,
  endDate: string,
  taskId: string,
  shared = false,
): DashboardDueTasksData | undefined {
  const key = shared ? dashboardSharedDueTasksQueryKey(userId, endDate) : dashboardDueTasksQueryKey(userId, endDate)
  const previous = queryClient.getQueryData<DashboardDueTasksData>(key)
  if (!previous) return undefined
  queryClient.setQueryData<DashboardDueTasksData>(key, previous.filter((t) => t.id !== taskId))
  return previous
}

export function restoreDashboardDueTasks(
  queryClient: QueryClient,
  userId: string | undefined,
  endDate: string,
  previous: DashboardDueTasksData | undefined,
  shared = false,
) {
  if (!previous) return
  queryClient.setQueryData(shared ? dashboardSharedDueTasksQueryKey(userId, endDate) : dashboardDueTasksQueryKey(userId, endDate), previous)
}

/** Patch studio bundle after local status change (optimistic complete/reopen). */
export function patchStudioTaskStatus(
  queryClient: QueryClient,
  userId: string | undefined,
  taskId: string,
  next: Pick<StudioTask, 'status' | 'completed' | 'completedAt'>,
  shared = false,
): StudioTasksBundle | undefined {
  const key = shared ? collaborativeStudioTasksQueryKey(userId) : studioTasksQueryKey(userId)
  const previous = queryClient.getQueryData<StudioTasksBundle>(key)
  if (!previous) return undefined

  queryClient.setQueryData<StudioTasksBundle>(key, {
    ...previous,
    tasks: previous.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            status: next.status,
            completed: next.completed,
            completedAt: next.completedAt,
          }
        : t,
    ),
  })
  return previous
}

export function restoreStudioTasksBundle(
  queryClient: QueryClient,
  userId: string | undefined,
  previous: StudioTasksBundle | undefined,
  shared = false,
) {
  if (!previous) return
  queryClient.setQueryData(shared ? collaborativeStudioTasksQueryKey(userId) : studioTasksQueryKey(userId), previous)
}

function weddingTaskCacheKeys(
  userId: string | undefined,
  weddingId: string,
) {
  return [
    weddingTasksQueryKey(userId, weddingId),
    // Legacy WeddingDetailPage shape (pre-1D.3.1).
    ['tasks', userId, weddingId] as const,
  ]
}

/** Keep Wedding Detail task lists in sync after create/update/reassign. */
export function syncWeddingTaskCaches(
  queryClient: QueryClient,
  userId: string | undefined,
  input: {
    task: Task
    previousWeddingId?: string | null
    nextWeddingId?: string | null
  },
) {
  const { task, previousWeddingId = null, nextWeddingId = null } = input
  const prev = previousWeddingId?.trim() || null
  const next = nextWeddingId?.trim() || null

  if (prev && prev !== next) {
    for (const key of weddingTaskCacheKeys(userId, prev)) {
      queryClient.setQueryData<Task[]>(key, (old) =>
        (old ?? []).filter((t) => t.id !== task.id),
      )
    }
  }

  if (next) {
    for (const key of weddingTaskCacheKeys(userId, next)) {
      queryClient.setQueryData<Task[]>(key, (old) => {
        const list = old ?? []
        const idx = list.findIndex((t) => t.id === task.id)
        if (idx >= 0) {
          const copy = list.slice()
          copy[idx] = { ...list[idx], ...task, weddingId: next }
          return copy
        }
        return [...list, { ...task, weddingId: next }]
      })
    }
  }
}

/** Remove a task from wedding Historia caches (delete). */
export function removeTaskFromWeddingCaches(
  queryClient: QueryClient,
  userId: string | undefined,
  task: Pick<Task, 'id' | 'weddingId'>,
) {
  const weddingId = task.weddingId?.trim()
  if (!weddingId) return
  for (const key of weddingTaskCacheKeys(userId, weddingId)) {
    queryClient.setQueryData<Task[]>(key, (old) =>
      (old ?? []).filter((t) => t.id !== task.id),
    )
  }
}

/** Patch status on wedding caches after optimistic complete/reopen. */
export function patchWeddingTaskStatus(
  queryClient: QueryClient,
  userId: string | undefined,
  task: Pick<Task, 'id' | 'weddingId'>,
  next: Pick<Task, 'completed'>,
) {
  const weddingId = task.weddingId?.trim()
  if (!weddingId) return
  for (const key of weddingTaskCacheKeys(userId, weddingId)) {
    queryClient.setQueryData<Task[]>(key, (old) => {
      if (!old) return old
      return old.map((t) =>
        t.id === task.id ? { ...t, completed: next.completed } : t,
      )
    })
  }
}
