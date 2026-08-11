import { motion, useReducedMotion } from 'framer-motion'
import { DesktopCompositionScale } from '@/features/landing-v3/components/DesktopCompositionScale'
import { useLandingViewportMode } from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { DURATION, premiumEase } from '@/features/landing-v3/motion/variants'
import { CalendarLandingPreview } from '@/features/landing-v3/product/CalendarLandingPreview'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const DESKTOP_THRESHOLD = 0.6

/** Calendar — full month, constrained width, short reveal. */
export function CalendarSection() {
  const reduced = useReducedMotion()
  const viewport = useLandingViewportMode()
  const scaled = viewport !== 'desktop'
  const { ref, active } = useSectionReveal({
    threshold: scaled ? 0.05 : DESKTOP_THRESHOLD,
    topTriggerRatio: scaled ? 0.72 : undefined,
    reduced: !!reduced,
  })

  return (
    <section
      ref={ref}
      className={styles.calendarSection}
      data-testid="lv3-calendar-section"
      data-viewport-mode={viewport}
      aria-labelledby="calendar-title"
    >
      <div className={styles.sectionIntro}>
        <h2 id="calendar-title" className={styles.titleB}>
          Terminy zawsze tam,
          <br />
          gdzie ich potrzebujesz.
        </h2>
        <p className={styles.editorialLead}>
          Śluby i sesje mogą automatycznie trafiać do Google Calendar i Apple
          Calendar. Zmiana w OurWed aktualizuje również wydarzenie.
        </p>
      </div>

      <DesktopCompositionScale composition="calendar">
        <motion.div
          className={styles.calendarVisualCentered}
          data-landing-preview=""
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={active ? { opacity: 1, y: 0 } : { opacity: 0.55, y: 10 }}
          transition={{
            duration: reduced ? 0 : DURATION.panel,
            ease: premiumEase,
          }}
        >
          <CalendarLandingPreview animate={active} />
        </motion.div>
      </DesktopCompositionScale>
    </section>
  )
}
