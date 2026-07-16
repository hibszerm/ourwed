import type { Task } from '@/types/wedding'

let tasksStore: Task[] = [
  {
    id: 't1',
    weddingId: 'w1',
    title: 'Potwierdzić shooting schedule z parą',
    dueDate: '2026-07-16',
    completed: false,
    priority: 'high',
  },
  {
    id: 't2',
    weddingId: 'w1',
    title: 'Przygotować preset kolorystyczny pod teaser',
    dueDate: '2026-07-16',
    completed: false,
    priority: 'medium',
  },
  {
    id: 't3',
    weddingId: 'w2',
    title: 'Zamknąć listę ujęć z konsultacji',
    dueDate: '2026-07-16',
    completed: true,
    priority: 'medium',
  },
  {
    id: 't4',
    weddingId: 'w1',
    title: 'Sprawdzić backup baterii i kart pamięci',
    dueDate: '2026-07-16',
    completed: false,
    priority: 'low',
  },
  {
    id: 't5',
    weddingId: 'w3',
    title: 'Wysłać brief współpracy dla second shootera',
    dueDate: '2026-07-17',
    completed: false,
    priority: 'medium',
  },
]

export const mockTasks = tasksStore

export function addTask(task: Task) {
  tasksStore = [...tasksStore, task]
}

export function getTasks() {
  return tasksStore
}
