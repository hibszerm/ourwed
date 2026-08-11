import { motion, useReducedMotion } from 'framer-motion'
import { DesktopCompositionScale } from '@/features/landing-v3/components/DesktopCompositionScale'
import { useLandingViewportMode } from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { DURATION, premiumEase } from '@/features/landing-v3/motion/variants'
import { LandingBriefPreview } from '@/features/landing-v3/product/LandingBriefPreview'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const DESKTOP_THRESHOLD = 0.55

const BENEFITS = [
  'Plan dnia w poprawnej kolejności',
  'Adresy i szybka nawigacja',
  'Kontakty do najważniejszych osób',
  'Notatki i ustalenia pary',
] as const

/** Brief — separate feature section below Calendar. */
export function BriefSection() {
  const reduced = useReducedMotion()
  const viewport = useLandingViewportMode()
  const scaled = viewport !== 'desktop'
  const { ref, active } = useSectionReveal({
    threshold: scaled ? 0.05 : DESKTOP_THRESHOLD,
    topTriggerRatio: scaled ? 0.7 : undefined,
    reduced: !!reduced,
    forceCompleteOnExitAbove: scaled,
  })

  return (
    <section
      ref={ref}
      className={styles.briefSection}
      data-testid="lv3-brief-section"
      data-viewport-mode={viewport}
      aria-labelledby="brief-title"
    >
      <div className={styles.sectionIntro}>
        <h2 id="brief-title" className={styles.titleB}>
          Wszystko, czego potrzebujesz
          <br />
          przed wyjazdem.
        </h2>
        <p className={styles.editorialLead}>
          Harmonogram, adresy, kontakty, przejazdy i najważniejsze ustalenia w
          jednym czytelnym briefie PDF.
        </p>
      </div>

      <DesktopCompositionScale composition="brief">
        <div className={styles.briefSplit} data-landing-preview="">
          <motion.div
            className={styles.briefDocCol}
            initial={reduced ? false : { opacity: 0, x: -36 }}
            animate={active ? { opacity: 1, x: 0 } : { opacity: 0.5, x: -20 }}
            transition={{ duration: reduced ? 0 : 0.5, ease: premiumEase }}
          >
            <LandingBriefPreview showBackPage />
            <button type="button" className={styles.briefDownload} tabIndex={-1}>
              Pobierz brief PDF
            </button>
          </motion.div>

          <ol className={styles.briefBenefits}>
            {BENEFITS.map((item, i) => (
              <motion.li
                key={item}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={active ? { opacity: 1, y: 0 } : { opacity: 0.4, y: 6 }}
                transition={{
                  duration: reduced ? 0 : DURATION.micro,
                  delay: reduced ? 0 : 0.22 + i * 0.07,
                  ease: premiumEase,
                }}
              >
                <span className={styles.briefNum}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{item}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      </DesktopCompositionScale>
    </section>
  )
}
