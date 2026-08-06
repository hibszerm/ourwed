import { useEffect, useState } from 'react'
import {
  DEMO_ASSIGNMENT,
  demoRouteTotal,
} from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import { usePrefersReducedMotion } from '@/features/landing-v3/hooks/usePrefersReducedMotion'
import styles from './mobileArtboard.module.css'

const Q_FIELDS = [
  { label: 'Ceremonia', value: DEMO_ASSIGNMENT.ceremony },
  { label: 'Przyjęcie', value: 'Folwark Wąsowo' },
  { label: 'Godzina', value: DEMO_ASSIGNMENT.ceremonyTime },
] as const

const ITINERARY = [
  { time: '09:00', title: 'Start', place: 'Studio, Poznań', travel: null as string | null },
  {
    time: '09:30',
    title: 'Przygotowania Pana Młodego',
    place: 'Apartamenty Stary Rynek',
    travel: '18 min · 12 km',
  },
  {
    time: '10:30',
    title: 'Przygotowania Panny Młodej',
    place: 'Hotel Liberté',
    travel: '21 min · 16 km',
  },
  {
    time: '14:00',
    title: 'Ceremonia',
    place: 'Kościół św. Anny',
    travel: '24 min · 18 km',
  },
  {
    time: '16:00',
    title: 'Przyjęcie weselne',
    place: 'Folwark Wąsowo',
    travel: '17 min · 11 km',
  },
] as const

/** Parity artboard — questionnaire → itinerary transfer on graphite. */
export function MobileDayArtboard() {
  const reduced = usePrefersReducedMotion()
  return (
    <MobileRevealAnchor reduced={reduced}>
      {(active) => <DayScene active={active || reduced} reduced={reduced} />}
    </MobileRevealAnchor>
  )
}

function DayScene({ active, reduced }: { active: boolean; reduced: boolean }) {
  const [check, setCheck] = useState(reduced)
  const [totals, setTotals] = useState(reduced)

  useEffect(() => {
    if (!active) return
    if (reduced) {
      const t = window.setTimeout(() => {
        setCheck(true)
        setTotals(true)
      }, 0)
      return () => window.clearTimeout(t)
    }
    const t1 = window.setTimeout(() => setCheck(true), 400)
    const t2 = window.setTimeout(() => setTotals(true), 1400)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [active, reduced])

  return (
    <div
      className={styles.dayBoard}
      data-mobile-artboard="wedding-day"
      data-artboard-pattern="parity-scale"
    >
      <div className={styles.daySummary} data-surface="questionnaire">
        <p className={styles.daySummaryEyebrow}>Ankieta przedślubna</p>
        <h3>{DEMO_ASSIGNMENT.displayName}</h3>
        <p>
          {DEMO_ASSIGNMENT.dateLabel} · {DEMO_ASSIGNMENT.ceremonyTime} ceremonia
        </p>
        {Q_FIELDS.map((f) => (
          <div key={f.label} className={styles.dayField}>
            <span>{f.label}</span>
            <strong>{f.value}</strong>
          </div>
        ))}
        <span className={styles.dayCheck} data-active={check ? 'true' : 'false'}>
          ✓ Zastosowano odpowiedzi
        </span>
      </div>

      <div className={styles.dayItineraryCard} data-surface="itinerary" data-dominant="true">
        <p className={styles.daySummaryEyebrow}>Plan dnia</p>
        <ol className={styles.dayItin}>
          {ITINERARY.map((row) => (
            <li key={row.time}>
              <time>{row.time}</time>
              <div>
                <strong>{row.title}</strong>
                <em>
                  {row.place}
                  {row.travel ? ` · ${row.travel}` : ''}
                </em>
              </div>
            </li>
          ))}
        </ol>
        <div className={styles.dayTotals} data-active={totals ? 'true' : 'false'}>
          <span>Trasa dnia</span>
          <span>
            {demoRouteTotal.distance} · {demoRouteTotal.duration}
          </span>
        </div>
      </div>
    </div>
  )
}
