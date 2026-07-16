import { supabase } from '@/lib/supabase'
import { throwOnError, toDateString } from '@/lib/supabase/helpers'
import type { Task } from '@/types/wedding'

type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'

interface TaskRow {
  id: string
  wedding_id: string
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
    weddingId: row.wedding_id,
    title: row.title,
    dueDate: toDateString(row.due_date) || toDateString(row.created_at),
    completed: status === 'done',
    priority: 'medium',
  }
}

export interface CreateTaskInput {
  weddingId: string
  title: string
  description?: string
  dueDate?: string
  status?: TaskStatus
}

export interface UpdateTaskInput {
  title?: string
  description?: string | null
  dueDate?: string | null
  status?: TaskStatus
}

/**
 * Tasks data layer — `public.tasks` only.
 */
export const taskService = {
  async listByWeddingId(weddingId: string): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('wedding_id', weddingId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    throwOnError(error)

    return ((data ?? []) as TaskRow[]).map(mapTaskRowToModel)
  },

  async listAll(): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })

    throwOnError(error)

    return ((data ?? []) as TaskRow[]).map(mapTaskRowToModel)
  },

  async listDueOn(date: string): Promise<Task[]> {
    const day = date.slice(0, 10)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('due_date', day)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })

    throwOnError(error)

    return ((data ?? []) as TaskRow[]).map(mapTaskRowToModel)
  },

  async create(input: CreateTaskInput): Promise<Task> {
    const title = input.title.trim()
    if (!title) throw new Error('Tytuł zadania nie może być pusty.')

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        wedding_id: input.weddingId,
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

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    throwOnError(error)
  },
}
