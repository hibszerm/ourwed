import { Link } from 'react-router-dom'
import { useNearestDeliveryDeadlines } from '@/features/dashboard/hooks/useNearestDeliveryDeadline'
import { deadlineEmptyCopy } from '@/features/dashboard/presentation/dashboardEmptyCopy'
import type { NearestDeliveryDeadline } from '@/lib/api/dashboardService'
import { getDeliveryDeadlineBand } from '@/lib/utils/weddingDeliveryDeadline'
import { toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import styles from './DashboardV3DeadlinePanel.module.css'

function deadlineAriaLabel(
  deadline: NearestDeliveryDeadline,
  dueLabel: string,
  contextLabel: string | null,
) {
  return `Otwórz ślub ${deadline.title}, termin oddania ${dueLabel}${
    contextLabel ? `, ${contextLabel}` : ''
  }`
}

function dueDateParts(dueDate: string) {
  const key = toLocalCalendarDateKey(dueDate) ?? dueDate
  const date = new Date(`${key}T12:00:00`)
  return {
    day: date.toLocaleDateString('pl-PL', { day: 'numeric' }),
    month: date.toLocaleDateString('pl-PL', { month: 'short' }),
  }
}

export function DashboardV3DeadlinePanel({
  hasWeddingHistory = false,
}: {
  /** True when the studio has any wedding history (not merely active deadlines). */
  hasWeddingHistory?: boolean
}) {
  const { data, isLoading } = useNearestDeliveryDeadlines()
  const deadlines = data ?? []
  const emptyCopy = deadlineEmptyCopy(hasWeddingHistory)

  return (
    <section
      className={`${styles.panel} v3MaterialOperational`}
      aria-labelledby="dashboard-v3-deadlines-title"
      data-testid="dashboard-v3-deadline-panel"
    >
      <header className={styles.header}>
        <h2 className={styles.title} id="dashboard-v3-deadlines-title">
          Terminy oddania
        </h2>
        {deadlines.length > 0 ? (
          <span className={styles.count}>{deadlines.length}</span>
        ) : null}
      </header>

      {isLoading ? (
        <div className={styles.loading} aria-hidden />
      ) : deadlines.length > 0 ? (
        <ul className={styles.list}>
          {deadlines.map((deadline, index) => (
            <li key={deadline.weddingId}>
              <DeadlineRow deadline={deadline} nearest={index === 0} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{emptyCopy.title}</p>
          <p className={styles.emptyCopy}>{emptyCopy.body}</p>
        </div>
      )}
    </section>
  )
}

function DeadlineRow({
  deadline,
  nearest,
}: {
  deadline: NearestDeliveryDeadline
  nearest: boolean
}) {
  const band = getDeliveryDeadlineBand({
    deliveryDueDate: deadline.deliveryDueDate,
    deliveryCompletedAt: deadline.deliveryCompletedAt,
  })
  const parts = dueDateParts(deadline.deliveryDueDate)

  return (
    <Link
      to={deadline.href}
      className={`${styles.row} ${nearest ? styles.rowNearest : ''}`}
      aria-label={deadlineAriaLabel(deadline, band.dueLabel, band.contextLabel)}
    >
      <span className={styles.marker} aria-hidden>
        <span className={styles.markerDay}>{parts.day}</span>
        <span className={styles.markerMonth}>{parts.month}</span>
      </span>
      <span className={styles.body}>
        <span className={styles.name}>{deadline.title}</span>
        <time className={styles.date}>{band.dueLabel}</time>
      </span>
      {band.contextLabel ? (
        <span className={styles.relative} data-state={band.state}>
          {band.contextLabel}
        </span>
      ) : null}
    </Link>
  )
}
