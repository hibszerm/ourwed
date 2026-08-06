import { DEMO_ASSIGNMENT, DEMO_SESSION } from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import styles from './mobileArtboard.module.css'

/** Pattern B — compact wedding + session pair. */
export function MobileSessionsArtboard() {
  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={`${styles.board} ${styles.sessionsBoard}`}
          data-mobile-artboard="sessions"
          data-artboard-pattern="B"
          data-reveal-active={active ? 'true' : 'false'}
        >
          <article className={styles.sessionCard}>
            <p className={styles.eyebrow}>Ślub</p>
            <h3>{DEMO_ASSIGNMENT.displayName}</h3>
            <p>{DEMO_ASSIGNMENT.dateLabel}</p>
            <p>Folwark Wąsowo · {DEMO_ASSIGNMENT.packageName}</p>
          </article>
          <article className={styles.sessionCard}>
            <p className={styles.eyebrow}>Sesja</p>
            <h3>{DEMO_SESSION.displayName}</h3>
            <p>
              {DEMO_SESSION.dateLabel} · {DEMO_SESSION.timeLabel}
            </p>
            <p>
              {DEMO_SESSION.location} · {DEMO_SESSION.priceLabel}
            </p>
          </article>
        </div>
      )}
    </MobileRevealAnchor>
  )
}
