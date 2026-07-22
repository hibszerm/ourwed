import { useState } from 'react'
import { Link } from 'react-router-dom'
import { IconCheck } from '@/components/icons'
import { coupleName, formatShortDate } from '@/lib/utils/dates'
import type { Task, Wedding } from '@/types/wedding'
import styles from './TodoTodayCard.module.css'

interface TodoTodayCardProps {
  tasks: Task[]
  weddings: Wedding[]
  /** When set, task rows open via callback instead of router Link. */
  onOpenWedding?: (weddingId: string) => void
}

export function TodoTodayCard({
  tasks,
  weddings,
  onOpenWedding,
}: TodoTodayCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())

  const weddingById = new Map(weddings.map((w) => [w.id, w]))
  const visible = tasks.filter((t) => !dismissed.has(t.id))

  function handleComplete(id: string) {
    setDismissing((prev) => new Set(prev).add(id))
    setTimeout(() => {
      setDismissed((prev) => new Set(prev).add(id))
      setDismissing((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 320)
  }

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.title}>Dzisiaj</h3>
        {visible.length > 0 && (
          <span className={styles.count}>{visible.length}</span>
        )}
      </header>

      {visible.length === 0 ? (
        <div className={styles.done}>
          <span className={styles.doneIcon}>
            <IconCheck width={20} height={20} />
          </span>
          <p className={styles.doneText}>Czysty dzień</p>
          <p className={styles.doneSub}>Wszystkie dzisiejsze akcje wykonane</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {visible.map((task, i) => {
            const wedding = weddingById.get(task.weddingId)
            const couple = wedding
              ? coupleName(wedding.couple.partner1, wedding.couple.partner2)
              : null

            const bodyClass = styles.body
            const bodyLabel = couple ? `Otwórz ślub: ${couple}` : task.title
            const bodyContent = (
              <>
                {couple && <span className={styles.couple}>{couple}</span>}
                <span className={styles.taskTitle}>{task.title}</span>
                {wedding && (
                  <span className={styles.date}>{formatShortDate(wedding.date)}</span>
                )}
              </>
            )

            return (
              <li
                key={task.id}
                className={`${styles.item} ${dismissing.has(task.id) ? styles.exiting : ''}`}
                style={{ animationDelay: `${0.16 + i * 0.06}s` }}
              >
                <button
                  type="button"
                  className={styles.checkbox}
                  onClick={() => handleComplete(task.id)}
                  aria-label={`Oznacz jako wykonane: ${task.title}`}
                >
                  <IconCheck className={styles.checkIcon} width={14} height={14} />
                </button>

                {onOpenWedding && wedding ? (
                  <button
                    type="button"
                    className={bodyClass}
                    aria-label={bodyLabel}
                    onClick={() => onOpenWedding(wedding.id)}
                  >
                    {bodyContent}
                  </button>
                ) : (
                  <Link
                    to={wedding ? `/sluby/${wedding.id}` : '#'}
                    className={bodyClass}
                    aria-label={bodyLabel}
                  >
                    {bodyContent}
                  </Link>
                )}

                {task.priority === 'high' && (
                  <span className={styles.priority}>Pilne</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
