import { formatShortDate } from '@/lib/utils/dates'
import type { ActivityFeedItem } from '@/features/weddings/detail/v2/weddingDetailV2Types'
import styles from './WeddingDetailV2.module.css'

interface Props {
  items: ActivityFeedItem[]
  onShowAll: () => void
}

export function WeddingRecentActivity({ items, onShowAll }: Props) {
  const recent = items.slice(0, 5)

  return (
    <section className={styles.recentBlock} aria-label="Ostatnia aktywność">
      <div className={styles.issuesHeader}>
        <h2 className={styles.sectionHeading}>Ostatnia aktywność</h2>
        <button type="button" className={styles.textAction} onClick={onShowAll}>
          Pokaż całą aktywność
        </button>
      </div>
      {recent.length === 0 ? (
        <p className={styles.contextMuted}>Brak aktywności.</p>
      ) : (
        <ul className={styles.recentList}>
          {recent.map((item) => (
            <li key={item.id} className={styles.recentItem}>
              <div>
                <p className={styles.recentTitle}>{item.title}</p>
                {item.body ? (
                  <p className={styles.contextMuted}>{item.body}</p>
                ) : null}
              </div>
              <time className={styles.recentDate}>
                {formatShortDate(item.date)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
