import { DEMO_ASSIGNMENT, demoRouteTotal } from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import styles from './mobileArtboard.module.css'

const MODULES = [
  { id: 'contract', title: 'Umowa', status: 'Dokument gotowy', icon: true },
  { id: 'survey', title: 'Ankieta', status: 'Dane pary uzupełnione', icon: true },
  {
    id: 'payments',
    title: 'Płatności',
    status: `${DEMO_ASSIGNMENT.paidLabel} wpłacone`,
    icon: true,
  },
  {
    id: 'day',
    title: 'Plan dnia',
    status: `5 lokalizacji · ${demoRouteTotal.distance}`,
    icon: true,
  },
  { id: 'brief', title: 'Brief', status: 'PDF przed wyjazdem', icon: true },
  { id: 'calendar', title: 'Kalendarz', status: 'Zsynchronizowano', icon: true },
] as const

/** Parity artboard — central hub + 2×3 modules + connectors. */
export function MobileAssignmentArtboard() {
  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={styles.assignBoard}
          data-mobile-artboard="assignment"
          data-artboard-pattern="parity-scale"
          data-reveal-active={active ? 'true' : 'false'}
        >
          <svg
            className={styles.assignConnectors}
            viewBox="0 0 358 520"
            preserveAspectRatio="none"
            aria-hidden
          >
            {[
              'M 179 120 L 90 210',
              'M 179 120 L 268 210',
              'M 179 130 L 90 300',
              'M 179 130 L 268 300',
              'M 179 140 L 90 390',
              'M 179 140 L 268 390',
            ].map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                stroke="rgba(29, 39, 43, 0.14)"
                strokeWidth="1.25"
              />
            ))}
          </svg>

          <div className={styles.assignHub} data-dominant="true">
            <p className={styles.assignHubEyebrow}>Zlecenie</p>
            <h3>{DEMO_ASSIGNMENT.displayName}</h3>
            <p>{DEMO_ASSIGNMENT.dateLabel}</p>
            <p>{DEMO_ASSIGNMENT.packageName}</p>
            <p className={styles.assignHubStatus}>Status: Umowa</p>
          </div>

          <div className={styles.assignGrid}>
            {MODULES.map((m) => (
              <div key={m.id} className={styles.assignMod}>
                <span className={styles.assignModIcon} aria-hidden />
                <strong>{m.title}</strong>
                <span>{m.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </MobileRevealAnchor>
  )
}
