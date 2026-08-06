import { motion, useReducedMotion } from 'framer-motion'
import { IconCheck } from '@/components/icons'
import { demoCalendarIntegrations } from '@/features/landing-v3/data/demoData'
import { DURATION, premiumEase } from '@/features/landing-v3/motion/variants'
import styles from './CalendarLandingPreview.module.css'

const WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz'] as const

type Cell = {
  day: number | null
  event?: { title: string; place: string; kind: 'wedding' | 'session' }
}

/** June 2027 — Tue=1 … 5 week rows × 7 = 35 cells. */
const CELLS: Cell[] = [
  { day: null },
  { day: 1 },
  { day: 2 },
  { day: 3 },
  { day: 4 },
  { day: 5 },
  { day: 6 },
  { day: 7 },
  { day: 8 },
  { day: 9 },
  { day: 10 },
  { day: 11 },
  {
    day: 12,
    event: {
      title: 'Ślub — Natalia i Tomasz',
      place: 'Folwark Wąsowo',
      kind: 'wedding',
    },
  },
  { day: 13 },
  { day: 14 },
  { day: 15 },
  {
    day: 16,
    event: {
      title: 'Sesja — Marta i Jakub',
      place: 'Park Cytadela · 17:00',
      kind: 'session',
    },
  },
  { day: 17 },
  { day: 18 },
  {
    day: 19,
    event: {
      title: 'Ślub — Zuzanna i Patryk',
      place: 'Villa Love',
      kind: 'wedding',
    },
  },
  { day: 20 },
  { day: 21 },
  { day: 22 },
  { day: 23 },
  { day: 24 },
  { day: 25 },
  { day: 26 },
  { day: 27 },
  { day: 28 },
  { day: 29 },
  { day: 30 },
  { day: null },
  { day: null },
  { day: null },
  { day: null },
]

/** Focused full-month June 2027 — constrained aspect, readable events. */
export function CalendarLandingPreview({
  className = '',
  animate = false,
}: {
  className?: string
  animate?: boolean
}) {
  const reduced = useReducedMotion()
  const run = animate && !reduced

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(' ')}
      data-testid="lv3-calendar-preview"
      data-calendar-layout="full-month"
      data-calendar-aspect="constrained"
      data-landing-preview=""
    >
      <header className={styles.header}>
        <h3 className={styles.title}>Czerwiec 2027</h3>
        <p className={styles.sub}>Śluby i sesje w Twoim terminarzu</p>
      </header>

      <div className={styles.month}>
        <div className={styles.weekdays}>
          {WEEKDAYS.map((d) => (
            <div key={d} className={styles.weekday}>
              {d}
            </div>
          ))}
        </div>
        <div className={styles.grid} data-day-count="35">
          {CELLS.map((cell, i) => (
            <div
              key={i}
              className={[
                styles.cell,
                cell.day == null ? styles.empty : '',
                cell.event?.kind === 'wedding' ? styles.eventDay : '',
                cell.event?.kind === 'session' ? styles.sessionDay : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {cell.day != null ? (
                <span className={styles.dayNum}>{cell.day}</span>
              ) : null}
              {cell.event ? (
                <motion.div
                  className={styles.eventCard}
                  data-kind={cell.event.kind}
                  initial={run ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: reduced
                      ? 0
                      : cell.day === 12
                        ? 0.22
                        : cell.day === 16
                          ? 0.34
                          : 0.46,
                    duration: DURATION.micro,
                    ease: premiumEase,
                  }}
                >
                  <strong>{cell.event.title}</strong>
                  <span>{cell.event.place}</span>
                </motion.div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.integFooter} aria-label="Źródła synchronizacji">
        <div className={styles.integCell}>
          <strong>OurWed</strong>
          <span>Źródło danych</span>
        </div>
        <div className={styles.integCell}>
          <strong>{demoCalendarIntegrations.google.label}</strong>
          <motion.span
            className={styles.ok}
            initial={run ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.55, duration: DURATION.micro }}
          >
            <IconCheck width={14} height={14} aria-hidden />
            {demoCalendarIntegrations.google.status}
          </motion.span>
        </div>
        <div className={styles.integCell}>
          <strong>{demoCalendarIntegrations.apple.label}</strong>
          <motion.span
            className={styles.ok}
            initial={run ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.72, duration: DURATION.micro }}
          >
            <IconCheck width={14} height={14} aria-hidden />
            {demoCalendarIntegrations.apple.status}
          </motion.span>
        </div>
      </footer>
    </div>
  )
}
