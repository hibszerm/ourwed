import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { IconCheck } from '@/components/icons'
import { formatShortDate } from '@/lib/utils/dates'
import type { Task } from '@/types/wedding'
import editStyles from '@/features/weddings/edit/WeddingEdit.module.css'
import styles from './WeddingDetailTasks.module.css'

interface WeddingDetailTasksProps {
  tasks: Task[]
  editing?: boolean
  weddingId?: string
  onChangeTasks?: (tasks: Task[]) => void
}

export function WeddingDetailTasks({
  tasks,
  editing = false,
  weddingId = '',
  onChangeTasks,
}: WeddingDetailTasksProps) {
  const sorted = [...tasks].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  )
  const pending = sorted.filter((t) => !t.completed)

  function updateTask(id: string, patch: Partial<Task>) {
    onChangeTasks?.(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function removeTask(id: string) {
    onChangeTasks?.(tasks.filter((t) => t.id !== id))
  }

  function addTask() {
    onChangeTasks?.([
      ...tasks,
      {
        id: `temp-${crypto.randomUUID()}`,
        weddingId,
        title: '',
        dueDate: new Date().toISOString().slice(0, 10),
        completed: false,
        priority: 'medium',
      },
    ])
  }

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader
        title="Zadania"
        subtitle={
          pending.length > 0 ? `${pending.length} do wykonania` : 'Wszystko wykonane'
        }
        action={
          editing ? (
            <Button type="button" variant="secondary" size="sm" onClick={addTask}>
              Dodaj
            </Button>
          ) : undefined
        }
      />
      {sorted.length === 0 ? (
        <p className={styles.empty}>Brak zadań przypisanych do tego ślubu.</p>
      ) : editing ? (
        <ul className={editStyles.inlineList}>
          {sorted.map((task) => (
            <li key={task.id} className={editStyles.inlineItem}>
              <Input
                label="Tytuł"
                value={task.title}
                onChange={(e) => updateTask(task.id, { title: e.target.value })}
              />
              <div className={editStyles.fieldRow}>
                <Input
                  label="Termin"
                  type="date"
                  value={task.dueDate}
                  onChange={(e) =>
                    updateTask(task.id, { dueDate: e.target.value })
                  }
                />
                <label className={editStyles.muted} style={{ alignSelf: 'end' }}>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(e) =>
                      updateTask(task.id, { completed: e.target.checked })
                    }
                  />{' '}
                  Ukończone
                </label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeTask(task.id)}
              >
                Usuń
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.list}>
          {sorted.map((task) => (
            <li key={task.id} className={styles.item}>
              <span
                className={`${styles.checkbox} ${task.completed ? styles.checked : ''}`}
              >
                {task.completed && <IconCheck width={12} height={12} />}
              </span>
              <div className={styles.content}>
                <p className={task.completed ? styles.done : styles.title}>
                  {task.title}
                </p>
                <time className={styles.date}>
                  {formatShortDate(task.dueDate)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
