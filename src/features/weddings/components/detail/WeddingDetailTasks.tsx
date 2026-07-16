import { Card, CardHeader } from '@/components/ui/Card'
import { IconCheck } from '@/components/icons'
import { formatShortDate } from '@/lib/utils/dates'
import type { Task } from '@/types/wedding'
import styles from './WeddingDetailTasks.module.css'

interface WeddingDetailTasksProps {
  tasks: Task[]
}

export function WeddingDetailTasks({ tasks }: WeddingDetailTasksProps) {
  const sorted = [...tasks].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  )
  const pending = sorted.filter((t) => !t.completed)

  return (
    <Card padding="md" className={styles.card}>
      <CardHeader
        title="Zadania"
        subtitle={pending.length > 0 ? `${pending.length} do wykonania` : 'Wszystko wykonane'}
      />
      {sorted.length === 0 ? (
        <p className={styles.empty}>Brak zadań przypisanych do tego ślubu.</p>
      ) : (
        <ul className={styles.list}>
          {sorted.map((task) => (
            <li key={task.id} className={styles.item}>
              <span className={`${styles.checkbox} ${task.completed ? styles.checked : ''}`}>
                {task.completed && <IconCheck width={12} height={12} />}
              </span>
              <div className={styles.content}>
                <p className={task.completed ? styles.done : styles.title}>{task.title}</p>
                <time className={styles.date}>{formatShortDate(task.dueDate)}</time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
