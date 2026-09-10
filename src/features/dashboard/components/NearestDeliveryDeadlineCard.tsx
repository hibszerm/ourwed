import { Link } from 'react-router-dom'
import { useNearestDeliveryDeadlines } from '@/features/dashboard/hooks/useNearestDeliveryDeadline'
import { deadlineEmptyCopy } from '@/features/dashboard/presentation/dashboardEmptyCopy'
import { getDeliveryDeadlineBand } from '@/lib/utils/weddingDeliveryDeadline'
import type { NearestDeliveryDeadline } from '@/lib/api/dashboardService'
import styles from './NearestDeliveryDeadlineCard.module.css'

function deadlineAriaLabel(
  deadline: NearestDeliveryDeadline,
  dueLabel: string,
  contextLabel: string | null,
) {
  return `Otwórz ślub ${deadline.title}, termin oddania ${dueLabel}${
    contextLabel ? `, ${contextLabel}` : ''
  }`
}

export function NearestDeliveryDeadlineCard({
  hasWeddingHistory = false,
}: {
  hasWeddingHistory?: boolean
}) {
  const { data, isLoading } = useNearestDeliveryDeadlines()
  const deadlines = data ?? []
  const primary = deadlines[0] ?? null
  const secondary = deadlines.slice(1)
  const emptyCopy = deadlineEmptyCopy(hasWeddingHistory)

  return (
    <section
      className={styles.card}
      aria-labelledby="nearest-delivery-deadline-title"
      data-testid="nearest-delivery-deadline-card"
    >
      <h2 className={styles.title} id="nearest-delivery-deadline-title">
        Terminy oddania
      </h2>

      {isLoading ? (
        <div className={styles.loadingBlock} aria-hidden />
      ) : primary ? (
        <>
          <PrimaryDeadline deadline={primary} />
          {secondary.length > 0 ? (
            <div className={styles.secondaryGroup}>
              <p className={styles.secondaryLabel}>Kolejne</p>
              <ul className={styles.secondaryList}>
                {secondary.map((deadline) => (
                  <li key={deadline.weddingId}>
                    <SecondaryDeadline deadline={deadline} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>{emptyCopy.title}</p>
          <p className={styles.emptyCopy}>{emptyCopy.body}</p>
        </div>
      )}
    </section>
  )
}

function PrimaryDeadline({ deadline }: { deadline: NearestDeliveryDeadline }) {
  const band = getDeliveryDeadlineBand({
    deliveryDueDate: deadline.deliveryDueDate,
    deliveryCompletedAt: deadline.deliveryCompletedAt,
  })

  return (
    <Link
      to={deadline.href}
      className={styles.primary}
      aria-label={deadlineAriaLabel(deadline, band.dueLabel, band.contextLabel)}
    >
      <h3 className={styles.primaryName}>{deadline.title}</h3>
      <time className={styles.primaryDate}>{band.dueLabel}</time>
      {band.contextLabel ? (
        <span className={styles.primaryRelative} data-state={band.state}>
          {band.contextLabel}
        </span>
      ) : null}
    </Link>
  )
}

function SecondaryDeadline({
  deadline,
}: {
  deadline: NearestDeliveryDeadline
}) {
  const band = getDeliveryDeadlineBand({
    deliveryDueDate: deadline.deliveryDueDate,
    deliveryCompletedAt: deadline.deliveryCompletedAt,
  })

  return (
    <Link
      to={deadline.href}
      className={styles.secondaryRow}
      aria-label={deadlineAriaLabel(deadline, band.dueLabel, band.contextLabel)}
    >
      <span className={styles.secondaryName}>{deadline.title}</span>
      <span className={styles.secondaryMeta}>
        <time className={styles.secondaryDate}>{band.dueLabel}</time>
        {band.contextLabel ? (
          <>
            <span className={styles.dot} aria-hidden>
              ·
            </span>
            <span className={styles.secondaryRelative} data-state={band.state}>
              {band.contextLabel}
            </span>
          </>
        ) : null}
      </span>
    </Link>
  )
}
