import {
  getMobileNextStop,
  mobileWeddingDayDemo,
} from '@/features/landing-v3/data/mobileWeddingDayDemo'
import type { MobileDemoFocus } from '@/features/landing-v3/motion/mobileWeddingDaySequence'
import styles from './MobileAssignmentView.module.css'

const NAV_ROWS = [
  { id: 'plan', label: 'Plan dnia' },
  { id: 'brief', label: 'Brief' },
  { id: 'places', label: 'Lokalizacje' },
  { id: 'contacts', label: 'Kontakty' },
  { id: 'payments', label: 'Płatności' },
] as const

type Props = {
  focus: MobileDemoFocus
  dimmed?: boolean
  /** Layer visibility 0–1 */
  opacity?: number
  /** Horizontal shift for brief handoff (px, typically negative). */
  shiftX?: number
}

/** Stable assignment layer — always mounted inside display mask. */
export function MobileAssignmentView({
  focus,
  dimmed = false,
  opacity = 1,
  shiftX = 0,
}: Props) {
  const demo = mobileWeddingDayDemo
  const next = getMobileNextStop()

  return (
    <div
      className={styles.layer}
      data-mobile-screen="assignment"
      data-screen-layer="assignment"
      data-dimmed={dimmed ? 'true' : 'false'}
      style={{
        opacity,
        transform: `translateX(${shiftX}px)`,
      }}
    >
      <header className={styles.head}>
        <p className={styles.eyebrow}>Zlecenie</p>
        <h3 className={styles.title}>{demo.couple}</h3>
        <p className={styles.meta}>
          {demo.date} · {demo.receptionVenue}
        </p>
      </header>

      <section className={styles.next} aria-label="Następny punkt">
        <p className={styles.nextLabel}>Następny punkt</p>
        <p className={styles.nextTime}>{next.time}</p>
        <p className={styles.nextTitle}>{next.title}</p>
        <p className={styles.nextPlace}>{next.location}</p>

        <div className={styles.actions}>
          <span
            className={`${styles.action} ${styles.actionPrimary}`}
            data-focus={focus === 'navigate' ? 'true' : 'false'}
            data-demo-action="navigate"
          >
            Nawiguj
          </span>
          <span className={styles.action} data-demo-action="call">
            Zadzwoń
          </span>
        </div>
      </section>

      <nav className={styles.nav} aria-label="Skróty">
        {NAV_ROWS.map((row) => (
          <span
            key={row.id}
            className={styles.navRow}
            data-focus={
              focus === 'brief' && row.id === 'brief' ? 'true' : 'false'
            }
            data-demo-action={row.id}
          >
            {row.label}
            <span aria-hidden>›</span>
          </span>
        ))}
      </nav>

      <p className={styles.status}>Wszystko przygotowane</p>
    </div>
  )
}
