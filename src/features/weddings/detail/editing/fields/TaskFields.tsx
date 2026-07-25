import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Task } from '@/types/wedding'
import styles from '../WeddingEditorFields.module.css'

export function TaskFields({
  tasks,
  weddingId,
  onChangeTasks,
}: {
  tasks: Task[]
  weddingId: string
  onChangeTasks: (tasks: Task[]) => void
}) {
  const sorted = [...tasks].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  )

  return (
    <div className={styles.fieldGrid}>
      <div className={styles.rowActions}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            onChangeTasks([
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
        >
          Dodaj zadanie
        </Button>
      </div>
      {sorted.length === 0 ? (
        <p className={styles.muted}>Brak zadań.</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((task) => (
            <li key={task.id} className={styles.listItem}>
              <Input
                label="Tytuł"
                value={task.title}
                onChange={(e) =>
                  onChangeTasks(
                    tasks.map((t) =>
                      t.id === task.id ? { ...t, title: e.target.value } : t,
                    ),
                  )
                }
              />
              <div className={styles.fieldRow}>
                <Input
                  label="Termin"
                  type="date"
                  value={task.dueDate}
                  onChange={(e) =>
                    onChangeTasks(
                      tasks.map((t) =>
                        t.id === task.id
                          ? { ...t, dueDate: e.target.value }
                          : t,
                      ),
                    )
                  }
                />
                <label className={styles.muted}>
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(e) =>
                      onChangeTasks(
                        tasks.map((t) =>
                          t.id === task.id
                            ? { ...t, completed: e.target.checked }
                            : t,
                        ),
                      )
                    }
                  />{' '}
                  Wykonane
                </label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChangeTasks(tasks.filter((t) => t.id !== task.id))
                }
              >
                Usuń
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
