import { resolveStudioUserId } from '@/lib/api/studioUser'
import { supabase } from '@/lib/supabase'
import { throwOnError, toDateString } from '@/lib/supabase/helpers'
import type { Task } from '@/types/wedding'

type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'

interface TaskRow {
  id: string
  user_id: string
  wedding_id: string | null
  title: string
  description: string | null
  status: string
  due_date: string | null
  completed_at: string | null
  created_at: string
}

function isTaskStatus(value: string): value is TaskStatus {
  return (
    value === 'todo' ||
    value === 'in_progress' ||
    value === 'done' ||
    value === 'cancelled'
  )
}

/** Map `public.tasks` → app `Task`. */
export function mapTaskRowToModel(row: TaskRow): Task {
  const status = isTaskStatus(row.status) ? row.status : 'todo'
  return {
    id: row.id,
    weddingId: row.wedding_id ?? null,
    title: row.title,
    // Empty string = no due date. Never invent created_at as a fake deadline.
    dueDate: toDateString(row.due_date) || '',
    completed: status === 'done',
    // Priority is not persisted — display default only.
    priority: 'medium',
  }
}

/**
 * Studio / Tasks Center read DTO — includes status timestamps for grouping.
 * Does not expose display-only priority.
 */
export interface StudioTask {
  id: string
  title: string
  weddingId: string | null
  /** Empty string = no due date. */
  dueDate: string
  status: TaskStatus
  createdAt: string
  completedAt: string | null
  completed: boolean
}

export function mapTaskRowToStudioTask(row: TaskRow): StudioTask {
  const status = isTaskStatus(row.status) ? row.status : 'todo'
  return {
    id: row.id,
    title: row.title,
    weddingId: row.wedding_id ?? null,
    dueDate: toDateString(row.due_date) || '',
    status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    completed: status === 'done',
  }
}

export interface CreateTaskInput {
  title: string
  description?: string
  dueDate?: string | null
  /**
   * Optional wedding association.
   * Omit / null / undefined → unlinked studio task.
   * Caller cannot choose owner — always current studio user.
   */
  weddingId?: string | null
  status?: TaskStatus
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  dueDate?: string | null
  status?: TaskStatus
  /** Optional reassignment; RLS rejects other users' weddings. */
  weddingId?: string | null
}

/**
 * Tasks data layer — `public.tasks` only.
 * Ownership: DB `user_id` (= auth.uid / resolveStudioUserId).
 * Association: optional `wedding_id`.
 */
export const taskService = {
  async listByWeddingId(weddingId: string): Promise<Task[]> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('wedding_id', weddingId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    throwOnError(error)

    return ((data ?? []) as TaskRow[]).map(mapTaskRowToModel)
  },

  /**
   * Owner-scoped studio-wide list (linked + unlinked).
   * Task rows only — no wedding hydration (Center enriches labels separately).
   */
  async listForStudio(): Promise<StudioTask[]> {
    const userId = await resolveStudioUserId()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    throwOnError(error)

    return ((data ?? []) as TaskRow[]).map(mapTaskRowToStudioTask)
  },

  /**
   * @deprecated Prefer listForStudio(). Kept as owner-scoped alias — no longer
   * fans out via wedding IDs only (would miss unlinked tasks).
   */
  async listAll(): Promise<StudioTask[]> {
    return this.listForStudio()
  },

  /**
   * Exact calendar-day due tasks (owner-scoped, linked + unlinked).
   * Active statuses only — done/cancelled never returned.
   */
  async listDueOn(date: string): Promise<Task[]> {
    const userId = await resolveStudioUserId()
    const day = date.slice(0, 10)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('due_date', day)
      .in('status', ['todo', 'in_progress'])
      .order('created_at', { ascending: true })

    throwOnError(error)

    return ((data ?? []) as TaskRow[]).map(mapTaskRowToModel)
  },

  /**
   * Dashboard Dzisiaj: incomplete manual tasks due on or before local today.
   * Overdue + today. Excludes future, undated, done, cancelled.
   * Owner-scoped; no wedding hydration.
   */
  async listDueThrough(date: string): Promise<Task[]> {
    const userId = await resolveStudioUserId()
    const day = date.slice(0, 10)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .not('due_date', 'is', null)
      .lte('due_date', day)
      .in('status', ['todo', 'in_progress'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    throwOnError(error)

    return ((data ?? []) as TaskRow[]).map(mapTaskRowToModel)
  },

  async create(input: CreateTaskInput): Promise<Task> {
    const title = input.title.trim()
    if (!title) throw new Error('Tytuł zadania nie może być pusty.')

    const userId = await resolveStudioUserId()
    const weddingId =
      input.weddingId && input.weddingId.trim()
        ? input.weddingId.trim()
        : null

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        wedding_id: weddingId,
        title,
        description: input.description?.trim() || null,
        status: input.status ?? 'todo',
        due_date: input.dueDate?.slice(0, 10) || null,
      })
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się utworzyć zadania.')
    }

    return mapTaskRowToModel(data as TaskRow)
  },

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const patch: Record<string, unknown> = {}
    if (input.title !== undefined) {
      const title = input.title.trim()
      if (!title) throw new Error('Tytuł zadania nie może być pusty.')
      patch.title = title
    }
    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null
    }
    if (input.dueDate !== undefined) {
      patch.due_date = input.dueDate ? input.dueDate.slice(0, 10) : null
    }
    if (input.weddingId !== undefined) {
      patch.wedding_id =
        input.weddingId && input.weddingId.trim()
          ? input.weddingId.trim()
          : null
    }
    if (input.status !== undefined) {
      patch.status = input.status
      patch.completed_at =
        input.status === 'done' ? new Date().toISOString() : null
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    throwOnError(error)

    if (!data) {
      throw new Error('Nie udało się zaktualizować zadania.')
    }

    return mapTaskRowToModel(data as TaskRow)
  },

  async complete(id: string): Promise<Task> {
    return this.update(id, { status: 'done' })
  },

  async reopen(id: string): Promise<Task> {
    return this.update(id, { status: 'todo' })
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    throwOnError(error)
  },
}

/** React Query root for task domain consumers (Center / Dashboard / Detail). */
export const TASKS_QUERY_ROOT = 'tasks' as const
