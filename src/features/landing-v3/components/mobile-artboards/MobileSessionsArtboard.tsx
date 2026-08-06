import { DEMO_ASSIGNMENT, DEMO_SESSION } from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import styles from './mobileArtboard.module.css'

/** Parity artboard — editorial asymmetry: dominant wedding + smaller session. */
export function MobileSessionsArtboard() {
  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={styles.sessionsBoard}
          data-mobile-artboard="sessions"
          data-artboard-pattern="parity-scale"
          data-reveal-active={active ? 'true' : 'false'}
        >
          <article className={styles.sessionWedding} data-dominant="true">
            <p className={styles.eyebrow}>Ślub</p>
            <h3>{DEMO_ASSIGNMENT.displayName}</h3>
            <p>{DEMO_ASSIGNMENT.dateLabel}</p>
            <p>Folwark Wąsowo · {DEMO_ASSIGNMENT.packageName}</p>
            <p>Umowa · Płatności · Ankieta · Plan dnia</p>
          </article>
          <div className={styles.sessionDividerHint} aria-hidden />
          <article className={styles.sessionSession}>
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
