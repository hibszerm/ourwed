import { Card, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { IconCheck } from '@/components/icons'
import { formatShortDate } from '@/lib/utils/dates'
import type { Task } from '@/types/wedding'
import styles from './TasksSection.module.css'

interface TasksSectionProps {
  tasks: Task[]
}

export function TasksSection({ tasks }: TasksSectionProps) {
  const pending = tasks.filter((t) => !t.completed)

  return (
    <Card>
      <CardHeader
        title="Zadania"
        subtitle={pending.length > 0 ? `${pending.length} do wykonania` : 'Wszystko wykonane'}
      />
      {tasks.length === 0 ? (
        <p className={styles.empty}>Brak zadań przypisanych do tego ślubu.</p>
      ) : (
        <ul className={styles.list}>
          {tasks.map((task) => (
            <li key={task.id} className={styles.item}>
              <span className={`${styles.checkbox} ${task.completed ? styles.checked : ''}`}>
                {task.completed && <IconCheck width={12} height={12} />}
              </span>
              <div className={styles.content}>
                <p className={task.completed ? styles.done : ''}>{task.title}</p>
                <time className={styles.date}>{formatShortDate(task.dueDate)}</time>
              </div>
              {task.priority === 'high' && !task.completed && (
                <Badge variant="danger">Pilne</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
