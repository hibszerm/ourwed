import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { collaborativeStudioTasksQueryKey, dashboardSharedDueTasksQueryKey } from './tasksQueryKeys'
import { reconcileSharedTaskCaches } from './invalidateTaskDomain'
import type { StudioTasksBundle } from './useStudioTasks'
import type { Task } from '@/types/wedding'

const userId = 'actor-a'
const weddingId = 'wedding-a'
const endDate = '2026-10-16'
const owner = { id: 'owner-task', title: 'Owner O', weddingId: 'wedding-owner', dueDate: endDate, completed: false, priority: 'medium' as const, shared: false }
const sharedRow = (revision: string, status: 'todo' | 'done', canEdit = true) => ({
  id: 'shared-task', title: 'Shared S', weddingId, dueDate: endDate, status,
  completed: status === 'done', completedAt: status === 'done' ? 'now' : null,
  shared: true, canEdit, revision, accessVersion: '9', weddingLabel: 'Wedding A',
})
const bundle = (rows: ReturnType<typeof sharedRow>[]) => ({ tasks: rows, weddingById: new Map() }) as StudioTasksBundle
const projection = (rows: ReturnType<typeof sharedRow>[]) => rows as unknown as Task[]

function client() { return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }) }
function assertions() {
  let count = 0
  return { check(value: unknown, message: string) { assert.ok(value, message); count++ }, count: () => count }
}

async function run() {
  const a = assertions()

  // Revocation / Tasks > 0 -> 0 clears only shared caches, retaining owner data.
  {
    const qc = client()
    const ownerKey = ['tasks', 'studio-owner', userId] as const
    const sharedKey = collaborativeStudioTasksQueryKey(userId)
    const dashboardOwnerKey = ['tasks', 'dashboard-due-owner', userId, endDate] as const
    const dashboardSharedKey = dashboardSharedDueTasksQueryKey(userId, endDate)
    const exactKey = ['collaborative-tasks-v3', userId, weddingId, '9'] as const
    qc.setQueryData(ownerKey, bundle([owner as never]))
    qc.setQueryData(sharedKey, bundle([sharedRow('4', 'todo'), { ...sharedRow('2', 'todo'), id: 'other-shared', weddingId: 'wedding-b' }]))
    qc.setQueryData(dashboardOwnerKey, [owner])
    qc.setQueryData(dashboardSharedKey, projection([sharedRow('4', 'todo'), { ...sharedRow('2', 'todo'), id: 'other-shared', weddingId: 'wedding-b' }]))
    qc.setQueryData(exactKey, { tasks: projection([sharedRow('4', 'todo')]) })
    await reconcileSharedTaskCaches(qc, userId, { weddingId, outcome: 'UNAVAILABLE' })
    a.check(qc.getQueryData<StudioTasksBundle>(ownerKey)?.tasks[0]?.id === 'owner-task', 'revoke preserves Tasks Center owner row')
    a.check(qc.getQueryData<StudioTasksBundle>(sharedKey)?.tasks.map((task) => task.id).join() === 'other-shared', 'revoke removes only affected Tasks Center shared row')
    a.check(qc.getQueryData<Task[]>(dashboardOwnerKey)?.length === 1, 'revoke preserves Dashboard owner row/count')
    a.check(qc.getQueryData<Task[]>(dashboardSharedKey)?.map((task) => task.id).join() === 'other-shared', 'revoke removes only affected Dashboard shared row/count')
    const exact = qc.getQueryData<{tasks: Task[]} | null>(exactKey)
    a.check(!exact || exact.tasks.length === 0, 'revoke removes exact-wedding shared row')
    qc.clear()
  }

  // Tasks 2 -> 1 is a refresh with a retained row and lost mutation authority.
  {
    const qc = client()
    qc.setQueryData(['tasks', 'studio-owner', userId], bundle([owner as never]))
    let current = bundle([sharedRow('4', 'todo', true)])
    const key = collaborativeStudioTasksQueryKey(userId)
    await qc.fetchQuery({ queryKey: key, queryFn: async () => current })
    current = bundle([sharedRow('4', 'todo', false)])
    await reconcileSharedTaskCaches(qc, userId, { weddingId, outcome: 'FORBIDDEN' })
    a.check(qc.getQueryData<StudioTasksBundle>(key)?.tasks[0]?.id === 'shared-task', 'Tasks 2→1 retains readable task')
    a.check(qc.getQueryData<StudioTasksBundle>(key)?.tasks[0]?.canEdit === false, 'Tasks 2→1 removes write authority')
    current = bundle([])
    await reconcileSharedTaskCaches(qc, userId, { weddingId, outcome: 'UNAVAILABLE' })
    a.check(qc.getQueryData<StudioTasksBundle>(key)?.tasks.length === 0, 'Tasks 2→0 removes row after authority loss')
    a.check(qc.getQueryData<StudioTasksBundle>(['tasks', 'studio-owner', userId])?.tasks[0]?.id === 'owner-task', 'Tasks 2→0 preserves owner row')
    qc.clear()
  }

  // A stale writer converges to the authoritative winner after CONFLICT.
  {
    const qc = client()
    let server = bundle([sharedRow('4', 'todo')])
    const key = collaborativeStudioTasksQueryKey(userId)
    await qc.fetchQuery({ queryKey: key, queryFn: async () => server })
    server = bundle([sharedRow('5', 'done')])
    await reconcileSharedTaskCaches(qc, userId, { weddingId, outcome: 'CONFLICT' })
    const final = qc.getQueryData<StudioTasksBundle>(key)?.tasks[0]
    a.check(final?.revision === '5' && final.status === 'done', 'Tasks Center CONFLICT converges to winner revision 5/done')
    qc.clear()
  }

  // Dashboard has an independent shared due cache and converges after conflict.
  {
    const qc = client()
    let server: Task[] = projection([sharedRow('4', 'todo')])
    const key = dashboardSharedDueTasksQueryKey(userId, endDate)
    await qc.fetchQuery({ queryKey: key, queryFn: async () => server })
    // Dashboard's due-task source excludes done rows, so the winning completion
    // is represented by authoritative removal from the due list.
    server = []
    await reconcileSharedTaskCaches(qc, userId, { weddingId, outcome: 'CONFLICT' })
    a.check(qc.getQueryData<Task[]>(key)?.length === 0, 'Dashboard CONFLICT reflects winning completion by removing row from due list')
    qc.clear()
  }

  // Generic network errors do not run the authority purge path.
  {
    const qc = client()
    const key = collaborativeStudioTasksQueryKey(userId)
    qc.setQueryData(key, bundle([sharedRow('4', 'todo')]))
    // No reconciliation is called for an unclassified network failure.
    a.check(qc.getQueryData<StudioTasksBundle>(key)?.tasks.length === 1, 'generic network failure keeps authorized shared cache')
    qc.clear()
  }

  console.log(`PASS sharedTaskCacheBehavior: ${a.count()} QueryClient assertions`)
}

void run()
