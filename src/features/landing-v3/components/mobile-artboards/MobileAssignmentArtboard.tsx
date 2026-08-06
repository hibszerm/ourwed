import { DEMO_ASSIGNMENT, demoRouteTotal } from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import { MobileScaledStage } from '@/features/landing-v3/components/MobileScaledStage'
import styles from './mobileArtboard.module.css'

const MODULES = [
  { id: 'contract', title: 'Umowa', status: 'Dokument gotowy' },
  { id: 'survey', title: 'Ankieta', status: 'Dane pary uzupełnione' },
  {
    id: 'payments',
    title: 'Płatności',
    status: `${DEMO_ASSIGNMENT.paidLabel} · ${DEMO_ASSIGNMENT.remainingLabel}`,
  },
  {
    id: 'day',
    title: 'Plan dnia',
    status: `5 lokalizacji · ${demoRouteTotal.distance}`,
  },
  { id: 'brief', title: 'Brief', status: 'PDF przed wyjazdem' },
  { id: 'calendar', title: 'Kalendarz', status: 'Zsynchronizowano' },
] as const

/** Pattern A — scaled 760×860 hub composition. */
export function MobileAssignmentArtboard() {
  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={styles.assignBoard}
          data-mobile-artboard="assignment"
          data-artboard-pattern="A"
          data-reveal-active={active ? 'true' : 'false'}
        >
          <MobileScaledStage
            baseWidth={760}
            baseHeight={860}
            mobilePadding={16}
            minScale={0.42}
            maxScale={0.48}
          >
            <div className={styles.assignInner}>
              <div className={styles.assignHub}>
                <p className={styles.assignHubEyebrow}>Zlecenie</p>
                <h3>{DEMO_ASSIGNMENT.displayName}</h3>
                <p>
                  {DEMO_ASSIGNMENT.dateLabel} · {DEMO_ASSIGNMENT.packageName}
                </p>
              </div>
              <div className={styles.assignGrid}>
                {MODULES.map((m) => (
                  <div key={m.id} className={styles.assignMod}>
                    <strong>{m.title}</strong>
                    <span>{m.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </MobileScaledStage>
        </div>
      )}
    </MobileRevealAnchor>
  )
}
