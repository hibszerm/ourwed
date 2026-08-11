import { motion, useReducedMotion } from 'framer-motion'
import { DesktopCompositionScale } from '@/features/landing-v3/components/DesktopCompositionScale'
import {
  DEMO_ASSIGNMENT,
  demoRouteTotal,
} from '@/features/landing-v3/data/demoData'
import { useLandingViewportMode } from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { premiumEase } from '@/features/landing-v3/motion/variants'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const DESKTOP_THRESHOLD = 0.62

const DAY_FIELDS = [
  {
    label: 'Przygotowania Panny Młodej',
    value: DEMO_ASSIGNMENT.bridePrep,
  },
  {
    label: 'Przygotowania Pana Młodego',
    value: DEMO_ASSIGNMENT.groomPrep,
  },
  {
    label: 'Miejsce ceremonii',
    value: DEMO_ASSIGNMENT.ceremony,
  },
  {
    label: 'Godzina ceremonii',
    value: DEMO_ASSIGNMENT.ceremonyTime,
  },
  {
    label: 'Miejsce przyjęcia',
    value: DEMO_ASSIGNMENT.reception,
  },
  {
    label: 'Dodatkowe ustalenia',
    value: 'Tort o 21:30. Dyskretne ujęcia podczas ceremonii.',
  },
] as const

const ITINERARY = [
  {
    time: '09:00',
    title: 'Start',
    place: 'Studio, Poznań',
    travel: null as string | null,
  },
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

/**
 * Wedding day — complete composition from first paint.
 * Exact desktop canvas on every viewport; scaled below 1100px.
 */
export function QuestionnaireDaySection() {
  const reduced = useReducedMotion()
  const viewport = useLandingViewportMode()
  const scaled = viewport !== 'desktop'
  const { ref, active } = useSectionReveal({
    threshold: scaled ? 0.05 : DESKTOP_THRESHOLD,
    topTriggerRatio: scaled ? 0.72 : undefined,
    reduced: !!reduced,
  })
  const run = !!reduced || active

  return (
    <section
      ref={ref}
      className={styles.daySection}
      data-composition="full-bleed"
      data-day-layout="36-64"
      data-day-timing="calm-confirm"
      data-testid="lv3-day-section"
      data-viewport-mode={viewport}
      aria-labelledby="day-title"
    >
      <div className={styles.dayInner}>
        <div className={styles.sectionIntro}>
          <h2 id="day-title" className={styles.titleAOnDark}>
            Para uzupełnia szczegóły.
            <br />
            Ty dostajesz gotowy plan.
          </h2>
          <p className={styles.editorialLeadOnDark}>
            Miejsca, godziny, przejazdy i dodatkowe ustalenia trafiają do jednego
            uporządkowanego widoku.
          </p>
        </div>

        <DesktopCompositionScale composition="weddingDay">
          <div className={styles.daySplit} data-landing-preview="">
            <article
              className={styles.dayQuestionnaire}
              data-day-surface="questionnaire"
            >
              <p className={styles.surfaceEyebrowOnDark}>Ankieta przedślubna</p>
              <div className={styles.dayFields}>
                {DAY_FIELDS.map((f) => (
                  <div key={f.label} className={styles.dayField}>
                    <span>{f.label}</span>
                    <strong>{f.value}</strong>
                  </div>
                ))}
              </div>
              <p className={styles.dayCheck}>✓ Ankieta wypełniona</p>
            </article>

            <article className={styles.dayItinerary} data-day-surface="itinerary">
              <div className={styles.dayItineraryHead}>
                <p className={styles.surfaceEyebrowOnDark}>Plan dnia</p>
                <motion.p
                  className={styles.dayApproved}
                  data-testid="lv3-day-status"
                  data-day-status="static"
                  initial={false}
                  animate={run ? { opacity: 1 } : { opacity: 0.35 }}
                  transition={{
                    delay: reduced ? 0 : 0.6,
                    duration: reduced ? 0 : 0.35,
                    ease: premiumEase,
                  }}
                >
                  ✓ Dane z ankiety zastosowane
                </motion.p>
              </div>

              <ol className={styles.itineraryList}>
                {ITINERARY.map((stop, i) => (
                  <li key={stop.time}>
                    {stop.travel ? (
                      <motion.div
                        className={styles.travelLeg}
                        data-route-leg=""
                        initial={false}
                        animate={
                          run
                            ? { scaleY: 1, opacity: 1 }
                            : { scaleY: 0.15, opacity: 0.4 }
                        }
                        transition={{
                          duration: reduced ? 0 : 1.2,
                          delay: reduced ? 0 : 0.8 + i * 0.12,
                          ease: premiumEase,
                        }}
                        style={{ transformOrigin: 'top' }}
                      >
                        {stop.travel}
                      </motion.div>
                    ) : null}
                    <div className={styles.stopRow}>
                      <time>{stop.time}</time>
                      <div>
                        <strong>{stop.title}</strong>
                        <span>{stop.place}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              <motion.div
                className={styles.dayTotals}
                data-testid="lv3-day-totals"
                initial={false}
                animate={run ? { opacity: 1, y: 0 } : { opacity: 0.25, y: 6 }}
                transition={{
                  delay: reduced ? 0 : 2.0,
                  duration: reduced ? 0 : 0.4,
                  ease: premiumEase,
                }}
              >
                <span>{demoRouteTotal.distance}</span>
                <span>·</span>
                <span>{demoRouteTotal.duration}</span>
              </motion.div>
            </article>
          </div>
        </DesktopCompositionScale>
      </div>
    </section>
  )
}
