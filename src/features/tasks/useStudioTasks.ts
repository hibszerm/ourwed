import { useQuery } from '@tanstack/react-query'
import { useCurrentStudioUser } from '@/features/auth/useCurrentStudioUser'
import { listTaskWeddingMetaByIds } from '@/features/tasks/taskWeddingMeta'
import { studioTasksQueryKey } from '@/features/tasks/tasksQueryKeys'
import { taskService, type StudioTask } from '@/lib/api/taskService'
import type { TaskWeddingMeta } from '@/features/tasks/taskWeddingMeta'

export interface StudioTasksBundle {
  tasks: StudioTask[]
  weddingById: Map<string, TaskWeddingMeta>
}

async function loadStudioTasksBundle(): Promise<StudioTasksBundle> {
  const tasks = await taskService.listForStudio()
  const weddingIds = tasks
    .map((t) => t.weddingId)
    .filter((id): id is string => Boolean(id))
  const weddingById = await listTaskWeddingMetaByIds(weddingIds)
  return { tasks, weddingById }
}

export function useStudioTasks() {
  const { data: studioUser } = useCurrentStudioUser()
  const userId = studioUser?.id

  return useQuery({
    queryKey: studioTasksQueryKey(userId),
    queryFn: loadStudioTasksBundle,
    enabled: Boolean(userId),
    staleTime: 30_000,
  })
}
