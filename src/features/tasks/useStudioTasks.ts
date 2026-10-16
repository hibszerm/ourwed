import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import { listTaskWeddingMetaByIds } from '@/features/tasks/taskWeddingMeta'
import { collaborativeStudioTasksQueryKey, studioTasksQueryKey } from '@/features/tasks/tasksQueryKeys'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import type { TaskWeddingMeta } from '@/features/tasks/taskWeddingMeta'
import { collaborativeTasksService } from '@/features/collaboration/collaborativeTasksService'

export interface StudioTasksBundle {
  tasks: StudioTask[]
  weddingById: Map<string, TaskWeddingMeta>
}

const AUTHORITY_REVALIDATION_MS = 30_000

async function loadOwnedStudioTasks() {
  const tasks = (await taskService.listForStudio()).map((task) => ({ ...task, shared: false, canEdit: true }))
  const weddingById = await listTaskWeddingMetaByIds(tasks.map((task) => task.weddingId).filter((id): id is string => Boolean(id)))
  return { tasks, weddingById }
}

async function loadSharedStudioTasks() {
  const shared = await collaborativeTasksService.listGlobal()
  const tasks: StudioTask[] = shared.map((task) => ({
    id: task.id, title: task.title, weddingId: task.weddingId, dueDate: task.dueDate,
    status: task.status, createdAt: task.createdAt, completedAt: task.completedAt,
    completed: task.status === 'done', shared: true, canEdit: task.tasksLevel === 2,
    revision: task.revision, accessVersion: task.accessVersion, weddingLabel: task.weddingLabel,
  }))
  const weddingById = await listTaskWeddingMetaByIds(tasks.map((task) => task.weddingId).filter((id): id is string => Boolean(id)))
  for (const task of shared) {
    if (!weddingById.has(task.weddingId)) weddingById.set(task.weddingId, {
      id: task.weddingId, label: task.weddingLabel ?? 'Ślub', weddingDate: null,
    })
  }
  return { tasks, weddingById }
}

export function useStudioTasks() {
  const { data: studioUser } = useCurrentStudioUser()
  const userId = studioUser?.id
  const owned = useQuery({
    queryKey: studioTasksQueryKey(userId), queryFn: loadOwnedStudioTasks,
    enabled: Boolean(userId), staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
  })
  // The global RPC is the existing source of effective Tasks authority. A restrained
  // foreground revalidation bounds stale private rows while this screen stays mounted.
  const shared = useQuery({
    queryKey: collaborativeStudioTasksQueryKey(userId), queryFn: loadSharedStudioTasks,
    enabled: Boolean(userId), staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    refetchInterval: AUTHORITY_REVALIDATION_MS, refetchIntervalInBackground: false,
  })
  const data = useMemo<StudioTasksBundle | undefined>(() => {
    if (!owned.data && !shared.data) return undefined
    const weddingById = new Map(owned.data?.weddingById ?? [])
    for (const [id, meta] of shared.data?.weddingById ?? []) if (!weddingById.has(id)) weddingById.set(id, meta)
    return { tasks: [...(owned.data?.tasks ?? []), ...(shared.data?.tasks ?? [])], weddingById }
  }, [owned.data, shared.data])
  return {
    data,
    isError: owned.isError || shared.isError,
    isLoading: owned.isLoading || shared.isLoading,
    refetch: async () => { await Promise.all([owned.refetch(), shared.refetch()]) },
  }
}
