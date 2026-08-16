import type { StudioTask } from '@/lib/api/taskService'
import {
  localCalendarDateKey,
  toLocalCalendarDateKey,
} from '@/lib/utils/localCalendarDate'

export type TasksCenterFilter = 'active' | 'done'

export type TasksCenterSectionId =
  | 'overdue'
  | 'today'
  | 'upcoming'
  | 'undated'

export interface TasksCenterSection {
  id: TasksCenterSectionId
  title: string
  tasks: StudioTask[]
}

export function isActiveStudioTask(task: StudioTask): boolean {
  return task.status === 'todo' || task.status === 'in_progress'
}

export function isDoneStudioTask(task: StudioTask): boolean {
  return task.status === 'done'
}

function compareDueAsc(a: StudioTask, b: StudioTask): number {
  return (a.dueDate || '').localeCompare(b.dueDate || '')
}

function compareCreatedAsc(a: StudioTask, b: StudioTask): number {
  return a.createdAt.localeCompare(b.createdAt)
}

function compareCreatedDesc(a: StudioTask, b: StudioTask): number {
  return b.createdAt.localeCompare(a.createdAt)
}

function compareCompletedDesc(a: StudioTask, b: StudioTask): number {
  const ac = a.completedAt ?? ''
  const bc = b.completedAt ?? ''
  if (ac && bc) return bc.localeCompare(ac)
  if (ac) return -1
  if (bc) return 1
  return compareCreatedDesc(a, b)
}

/**
 * Group active tasks into Zaległe / Dziś / Nadchodzące / Bez terminu.
 * Omits empty sections. Uses local calendar day — not UTC ISO slice.
 */
export function groupActiveStudioTasks(
  tasks: StudioTask[],
  todayKey: string = localCalendarDateKey(),
): TasksCenterSection[] {
  const overdue: StudioTask[] = []
  const today: StudioTask[] = []
  const upcoming: StudioTask[] = []
  const undated: StudioTask[] = []

  for (const task of tasks) {
    if (!isActiveStudioTask(task)) continue
    const due = toLocalCalendarDateKey(task.dueDate)
    if (!due) {
      undated.push(task)
      continue
    }
    if (due < todayKey) overdue.push(task)
    else if (due === todayKey) today.push(task)
    else upcoming.push(task)
  }

  overdue.sort(compareDueAsc)
  today.sort(compareCreatedAsc)
  upcoming.sort(compareDueAsc)
  undated.sort(compareCreatedDesc)

  const sections: TasksCenterSection[] = []
  if (overdue.length) {
    sections.push({ id: 'overdue', title: 'Zaległe', tasks: overdue })
  }
  if (today.length) {
    sections.push({ id: 'today', title: 'Dziś', tasks: today })
  }
  if (upcoming.length) {
    sections.push({ id: 'upcoming', title: 'Nadchodzące', tasks: upcoming })
  }
  if (undated.length) {
    sections.push({ id: 'undated', title: 'Bez terminu', tasks: undated })
  }
  return sections
}

export function listDoneStudioTasks(tasks: StudioTask[]): StudioTask[] {
  return tasks.filter(isDoneStudioTask).sort(compareCompletedDesc)
}
