import { supabase } from '@/lib/supabase'

export type CollaborativeTaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export interface CollaborativeTask {
  id: string
  title: string
  weddingId: string
  dueDate: string
  status: CollaborativeTaskStatus
  completedAt: string | null
  createdAt: string
  revision: string
  tasksLevel: 1 | 2
  accessVersion: string
  weddingLabel?: string
}
export interface CollaborativeTaskProjection {
  weddingId: string
  accessVersion: string
  tasksLevel: 1 | 2
  tasks: CollaborativeTask[]
}
export interface CollaborativeTaskTarget {
  weddingId: string
  weddingLabel: string
  accessVersion: string
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TASK_RESPONSE_INVALID')
  return value as Record<string, unknown>
}
function revision(value: unknown): string {
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9][0-9]*$/.test(value)) throw new Error('TASK_RESPONSE_INVALID')
  return value
}
function accessVersion(value: unknown): string {
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9][0-9]*$/.test(value)) throw new Error('TASK_RESPONSE_INVALID')
  return value
}
function parseTask(value: unknown, context: { weddingId: string; tasksLevel: 1 | 2; accessVersion: string; weddingLabel?: string }): CollaborativeTask {
  const row = record(value)
  if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.created_at !== 'string'
    || (row.status !== 'todo' && row.status !== 'in_progress' && row.status !== 'done' && row.status !== 'cancelled')
    || (row.due_date !== null && typeof row.due_date !== 'string')
    || (row.completed_at !== null && typeof row.completed_at !== 'string')) throw new Error('TASK_RESPONSE_INVALID')
  if (row.wedding_id !== undefined && row.wedding_id !== context.weddingId) throw new Error('TASK_RESPONSE_INVALID')
  return { id: row.id, title: row.title, weddingId: context.weddingId,
    dueDate: typeof row.due_date === 'string' ? row.due_date.slice(0, 10) : '',
    status: row.status, completedAt: row.completed_at, createdAt: row.created_at,
    revision: revision(row.revision), tasksLevel: context.tasksLevel,
    accessVersion: context.accessVersion, weddingLabel: context.weddingLabel }
}
function throwRpc(error: { message?: string; code?: string } | null): void {
  if (!error) return
  const message = error.message ?? ''
  const normalized = ['UNAVAILABLE', 'FORBIDDEN', 'CONFLICT', 'VALIDATION_ERROR'].find((code) => message.includes(code))
  throw new Error(normalized ?? 'TASK_REQUEST_FAILED')
}

export const collaborativeTasksService = {
  async getWedding(weddingId: string): Promise<CollaborativeTaskProjection | null> {
    const { data, error } = await supabase.rpc('get_my_collaborative_wedding_tasks_v3', { p_wedding_id: weddingId })
    throwRpc(error)
    const row = record(data)
    if (row.kind === 'unavailable') return null
    if (row.kind !== 'shared' || row.wedding_id !== weddingId || !Array.isArray(row.tasks)
      || (row.tasks_level !== 1 && row.tasks_level !== 2)) throw new Error('TASK_RESPONSE_INVALID')
    const version = accessVersion(row.access_version)
    const tasksLevel = row.tasks_level
    return { weddingId, accessVersion: version, tasksLevel,
      tasks: row.tasks.map((task) => parseTask(task, { weddingId, tasksLevel, accessVersion: version })) }
  },
  async listGlobal(dueThrough?: string): Promise<CollaborativeTask[]> {
    const { data, error } = await supabase.rpc('get_my_collaborative_tasks_v3', { p_due_through: dueThrough ?? null })
    throwRpc(error)
    if (!Array.isArray(data)) throw new Error('TASK_RESPONSE_INVALID')
    return data.map((item) => {
      const row = record(item)
      if (typeof row.wedding_id !== 'string' || (row.tasks_level !== 1 && row.tasks_level !== 2)
        || typeof row.wedding_label !== 'string') throw new Error('TASK_RESPONSE_INVALID')
      return parseTask(row, { weddingId: row.wedding_id, tasksLevel: row.tasks_level,
        accessVersion: accessVersion(row.access_version), weddingLabel: row.wedding_label })
    })
  },
  async listTargets(): Promise<CollaborativeTaskTarget[]> {
    const { data, error } = await supabase.rpc('get_my_collaborative_task_targets_v3')
    throwRpc(error)
    if (!Array.isArray(data)) throw new Error('TASK_RESPONSE_INVALID')
    return data.map((item) => {
      const row = record(item)
      if (typeof row.wedding_id !== 'string' || typeof row.wedding_label !== 'string' || row.tasks_level !== 2) throw new Error('TASK_RESPONSE_INVALID')
      return { weddingId: row.wedding_id, weddingLabel: row.wedding_label, accessVersion: accessVersion(row.access_version) }
    })
  },
  async mutate(input: { action: 'create' | 'update' | 'complete' | 'reopen' | 'delete'; weddingId: string;
    accessVersion: string; taskId?: string; expectedRevision?: string; title?: string; dueDate?: string | null }) {
    const { data, error } = await supabase.rpc('mutate_my_collaborative_task_v3', {
      p_action: input.action, p_wedding_id: input.weddingId, p_access_version: input.accessVersion,
      p_task_id: input.taskId ?? null, p_expected_revision: input.expectedRevision ?? null,
      p_title: input.title ?? null, p_due_date: input.dueDate || null,
    })
    throwRpc(error)
    const row = record(data)
    if (row.deleted === true) return null
    return parseTask(row, { weddingId: input.weddingId, tasksLevel: 2, accessVersion: input.accessVersion })
  },
}
