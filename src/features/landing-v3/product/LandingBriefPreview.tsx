import { DEMO_ASSIGNMENT, demoRouteTotal } from '@/features/landing-v3/data/demoData'
import styles from './LandingBriefPreview.module.css'

const TIMELINE = [
  { time: '09:00', label: 'Start' },
  { time: '09:30', label: 'Przygotowania Pana Młodego' },
  { time: '10:30', label: 'Przygotowania Panny Młodej' },
  { time: '14:00', label: 'Ceremonia' },
  { time: '16:00', label: 'Przyjęcie weselne' },
] as const

const LOCATIONS = [
  'Apartamenty Stary Rynek',
  'Hotel Liberté',
  'Kościół św. Anny',
  'Folwark Wąsowo',
] as const

interface LandingBriefPreviewProps {
  className?: string
  animate?: boolean
  showBackPage?: boolean
}

/** One large brief document — no iframe, no internal scroll. */
export function LandingBriefPreview({
  className = '',
  showBackPage = false,
}: LandingBriefPreviewProps) {
  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      data-testid="lv3-brief-preview"
      data-landing-preview=""
    >
      {showBackPage ? <div className={styles.backPage} aria-hidden /> : null}
      <article className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Brief wyjazdu</p>
          <h3 className={styles.title}>{DEMO_ASSIGNMENT.displayName}</h3>
          <p className={styles.meta}>
            {DEMO_ASSIGNMENT.dateLabel} · {DEMO_ASSIGNMENT.packageName}
          </p>
        </header>

        <div className={styles.summary}>
          <div>
            <span>Ceremonia</span>
            <strong>14:00</strong>
          </div>
          <div>
            <span>Przyjęcie</span>
            <strong>16:00</strong>
          </div>
          <div>
            <span>Trasa</span>
            <strong>{demoRouteTotal.distance}</strong>
          </div>
          <div>
            <span>Przejazdy</span>
            <strong>{demoRouteTotal.duration}</strong>
          </div>
        </div>

        <div className={styles.columns}>
          <section>
            <h4>Plan dnia</h4>
            <ol className={styles.timeline}>
              {TIMELINE.map((row) => (
                <li key={row.time}>
                  <time>{row.time}</time>
                  <span>{row.label}</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h4>Lokalizacje</h4>
            <ul className={styles.locations}>
              {LOCATIONS.map((loc) => (
                <li key={loc}>{loc}</li>
              ))}
            </ul>
          </section>
        </div>

        <section className={styles.contacts}>
          <h4>Kontakty</h4>
          <ul>
            <li>Para — 500 100 200</li>
            <li>Świadkowie — Anna K. · 500 100 201</li>
            <li>Recepcja Folwark Wąsowo</li>
          </ul>
        </section>

        <footer className={styles.notes}>
          <h4>Najważniejsze informacje</h4>
          <ul>
            <li>Tort o 21:30 · dyskretne ujęcia podczas ceremonii</li>
            <li>
              Przejazdy:łącznie {demoRouteTotal.distance} · {demoRouteTotal.duration}
            </li>
          </ul>
        </footer>
      </article>
    </div>
  )
}
