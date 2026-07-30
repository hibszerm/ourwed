import { getAssignmentStatusItems } from '@/features/weddings/detail/v2/weddingWorkspaceSelectors'
import type { WeddingPlace } from '@/types/travel'
import type { Wedding } from '@/types/wedding'
import styles from './WeddingDetailV2.module.css'

interface WeddingAssignmentStatusProps {
  wedding: Wedding
  places: WeddingPlace[]
}

/**
 * Compact assignment-status checklist for Overview — existing state only.
 */
export function WeddingAssignmentStatus({
  wedding,
  places,
}: WeddingAssignmentStatusProps) {
  const items = getAssignmentStatusItems(wedding, places)

  if (items.length === 0) return null

  return (
    <section
      className={styles.assignmentStatus}
      aria-labelledby="assignment-status-title"
      data-testid="wedding-assignment-status"
    >
      <h2 id="assignment-status-title" className={styles.sectionHeading}>
        Stan zlecenia
      </h2>
      <ul className={styles.assignmentStatusList}>
        {items.map((item) => (
          <li
            key={item.id}
            className={styles.assignmentStatusItem}
            data-tone={item.tone}
            data-testid={`assignment-status-${item.id}`}
          >
            <span className={styles.assignmentStatusMark} aria-hidden>
              {item.tone === 'ok' ? '✓' : '⚠'}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
