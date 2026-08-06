import { MobileSessionsArtboard } from '@/features/landing-v3/components/mobile-artboards'
import { DEMO_ASSIGNMENT, DEMO_SESSION } from '@/features/landing-v3/data/demoData'
import {
  isMobileLandingMode,
  useLandingViewportMode,
} from '@/features/landing-v3/hooks/useLandingViewportMode'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

/** Section 7 — weddings and sessions. Wide split card. */
export function WeddingsSessionsSection() {
  const viewport = useLandingViewportMode()
  const mobile = isMobileLandingMode(viewport)

  return (
    <section
      className={styles.editorialSection}
      data-composition="asymmetric"
      data-testid="lv3-weddings-sessions"
      data-viewport-mode={viewport}
      aria-labelledby="sessions-title"
    >
      <div className={styles.sectionIntro}>
        <h2 id="sessions-title" className={styles.titleC}>
          Śluby i sesje.
          <br />
          W jednym kalendarzu.
        </h2>
      </div>

      {mobile ? (
        <MobileSessionsArtboard />
      ) : (
        <div className={styles.sessionsSplit} data-landing-preview="">
          <article className={styles.sessionSide}>
            <p className={styles.sessionKind}>ŚLUB</p>
            <h3>{DEMO_ASSIGNMENT.displayName}</h3>
            <p className={styles.sessionMeta}>{DEMO_ASSIGNMENT.dateLabel}</p>
            <p className={styles.sessionMeta}>Folwark Wąsowo</p>
            <p className={styles.sessionProcess}>
              Umowa · Płatności · Ankieta · Plan dnia
            </p>
          </article>
          <div className={styles.sessionDivider} aria-hidden />
          <article className={styles.sessionSide}>
            <p className={styles.sessionKind}>SESJA</p>
            <h3>{DEMO_SESSION.displayName}</h3>
            <p className={styles.sessionMeta}>{DEMO_SESSION.dateLabel}</p>
            <p className={styles.sessionMeta}>{DEMO_SESSION.timeLabel}</p>
            <p className={styles.sessionMeta}>{DEMO_SESSION.location}</p>
            <p className={styles.sessionMeta}>{DEMO_SESSION.priceLabel}</p>
            <p className={styles.sessionProcess}>Termin · Lokalizacja · Rozliczenie</p>
          </article>
        </div>
      )}
    </section>
  )
}
