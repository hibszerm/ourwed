import { motion, useReducedMotion } from 'framer-motion'
import { CalendarLandingPreview } from '@/features/landing-v3/product/CalendarLandingPreview'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { DURATION, premiumEase } from '@/features/landing-v3/motion/variants'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

/** Calendar — full month, constrained width, short reveal. */
export function CalendarSection() {
  const reduced = useReducedMotion()
  const { ref, active } = useSectionReveal({
    threshold: 0.6,
    reduced: !!reduced,
  })

  return (
    <section
      ref={ref}
      className={styles.calendarSection}
      data-testid="lv3-calendar-section"
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
    </section>
  )
}
