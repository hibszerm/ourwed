import { DEMO_ASSIGNMENT, DEMO_SESSION } from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import styles from './mobileArtboard.module.css'

const DOWS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'] as const

const EVENTS: Record<number, string> = {
  4: 'Sesja',
  12: 'Ślub',
  19: 'Sesja',
  26: 'Ślub',
}

/** Real-scale full-month calendar surface. */
export function MobileCalendarArtboard() {
  const days: Array<{ day: number | null; event?: string }> = []
  for (let i = 0; i < 1; i++) days.push({ day: null })
  for (let d = 1; d <= 30; d++) {
    days.push({ day: d, event: EVENTS[d] })
  }

  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={`${styles.board} ${styles.calBoard}`}
          data-mobile-artboard="calendar"
          data-artboard-pattern="parity-scale"
          data-reveal-active={active ? 'true' : 'false'}
        >
          <div className={styles.calInner}>
            <div className={styles.calHead}>
              <h3>Czerwiec 2027</h3>
              <span className={styles.calMeta}>Sezon</span>
            </div>
            <div className={styles.calGrid} aria-label="Kalendarz czerwca 2027">
              {DOWS.map((d) => (
                <span key={d} className={styles.calDow}>
                  {d}
                </span>
              ))}
              {days.map((cell, i) => (
                <div
                  key={i}
                  className={styles.calDay}
                  data-empty={cell.day == null ? 'true' : 'false'}
                  data-event={cell.event ? 'true' : 'false'}
                >
                  {cell.day ?? ''}
                  {cell.event ? (
                    <span className={styles.calChip}>{cell.event}</span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className={styles.calFooter}>
              <strong>OurWed</strong>
              <span>Google Calendar · Zsynchronizowano</span>
              <span>Apple Calendar · Aktywny</span>
              <span className={styles.calMeta}>
                {DEMO_ASSIGNMENT.displayName} · {DEMO_SESSION.displayName}
              </span>
            </div>
          </div>
        </div>
      )}
    </MobileRevealAnchor>
  )
}
