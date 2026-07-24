import type { DashboardV2TimelineItem } from '../buildDashboardV2Model'
import styles from '../DashboardV2.module.css'

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function ActivityTimeline({
  items,
}: {
  items: DashboardV2TimelineItem[]
}) {
  return (
    <section className={styles.section} aria-label="Oś czasu">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Aktywność</h2>
      </div>

      {items.length === 0 ? (
        <div className={styles.focusEmpty}>Brak ostatniej aktywności.</div>
      ) : (
        <div className={styles.timeline}>
          {items.map((item) => (
            <article key={item.id} className={styles.timelineItem}>
              <span className={styles.timelineDot} aria-hidden />
              <div>
                <h3 className={styles.timelineTitle}>{item.title}</h3>
                {item.detail ? (
                  <p className={styles.timelineDetail}>{item.detail}</p>
                ) : null}
                <p className={styles.timelineTime}>{formatWhen(item.at)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
