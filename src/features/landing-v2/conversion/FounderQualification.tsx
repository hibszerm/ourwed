import { motion, useReducedMotion } from 'framer-motion'
import {
  LV2_QUALIFICATION_AUDIENCE,
  LV2_QUALIFICATION_OPENING,
  LV2_QUALIFICATION_SIGNALS,
} from '@/features/landing-v2/conversion/qualificationClaims'
import founderStyles from '@/features/landing-v2/mobile-story/FounderStoryReveal.module.css'
import styles from './FounderQualification.module.css'

const COMPACT_EASE = [0.22, 1, 0.36, 1] as const
const SIGNAL_VIEWPORT = { once: true as const, amount: 0.2, margin: '0px 0px -24% 0px' }
const INTRO_VIEWPORT = { once: true as const, amount: 0.15, margin: '0px 0px -20% 0px' }

type Props = {
  /** Compact cover-flow: local whileInView for signals + audience. Desktop stays static. */
  localReveal?: boolean
  /** Compact editorial layout markers (2×2 audience). Independent of motion / PRM. */
  compactLayout?: boolean
}

/**
 * Continues the Founder black document — same surface, no new black chapter seam.
 * Mounted inside LandingV2FounderStory `.story`.
 *
 * Desktop: static document flow (no viewport reveals).
 * Compact: soft local whileInView on numbered rows + audience; structural black paint
 * stays on non-animated ancestors (.story + .root).
 */
export function FounderQualification({ localReveal = false, compactLayout = false }: Props) {
  const reduced = useReducedMotion()
  const reveal = localReveal && !reduced

  return (
    <section
      className={styles.root}
      data-founder-qualification=""
      data-testid="lv2-founder-qualification"
      data-qualification-paint="structural"
      data-qualification-motion={reveal ? 'local' : 'none'}
      data-qualification-compact={compactLayout ? 'true' : 'false'}
      aria-labelledby="lv2-qualification-heading"
    >
      <motion.header
        id="dla-kogo"
        className={styles.opening}
        data-qualification-opening=""
        data-landing-hash-anchor="dla-kogo"
        initial={reveal ? { opacity: 0, y: 14 } : false}
        whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
        viewport={INTRO_VIEWPORT}
        transition={{ duration: 0.85, ease: COMPACT_EASE }}
      >
        <div className={styles.chapterMarker} data-qualification-chapter-marker="">
          <span className={styles.chapterRule} aria-hidden />
          <p className={styles.chapterEyebrow}>{LV2_QUALIFICATION_OPENING.eyebrow}</p>
          <span className={styles.chapterRule} aria-hidden />
        </div>
        <h2
          id="lv2-qualification-heading"
          className={`${styles.headline} ${founderStyles.openingHeadline}`}
          data-type-tier="founder-opening"
        >
          <span className={styles.line}>{LV2_QUALIFICATION_OPENING.headlineLine1}</span>
          <span className={styles.line}>{LV2_QUALIFICATION_OPENING.headlineLine2}</span>
          <span className={styles.line}>{LV2_QUALIFICATION_OPENING.headlineLine3}</span>
        </h2>
        <p className={styles.support}>{LV2_QUALIFICATION_OPENING.support}</p>
      </motion.header>

      <div className={styles.signalGrid} data-qualification-signals="">
        {LV2_QUALIFICATION_SIGNALS.map((item) => (
          <motion.article
            key={item.id}
            className={styles.signal}
            data-qualification-signal={item.id}
            initial={reveal ? { opacity: 0, y: 18 } : false}
            whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
            viewport={SIGNAL_VIEWPORT}
            transition={{ duration: 0.8, ease: COMPACT_EASE }}
          >
            <p className={styles.signalIndex}>{item.id}</p>
            <div className={styles.signalRule} aria-hidden />
            <h3 className={styles.signalHeadline}>{item.headline}</h3>
            <p className={styles.signalSupport}>{item.support}</p>
          </motion.article>
        ))}
      </div>

      <motion.footer
        className={styles.audience}
        data-founder-audience=""
        data-audience-layout={compactLayout ? 'grid-2x2' : 'row'}
        initial={reveal ? { opacity: 0, y: 14 } : false}
        whileInView={reveal ? { opacity: 1, y: 0 } : undefined}
        viewport={INTRO_VIEWPORT}
        transition={{ duration: 0.85, ease: COMPACT_EASE }}
      >
        <p className={styles.audienceEyebrow}>{LV2_QUALIFICATION_AUDIENCE.eyebrow}</p>
        <ul className={styles.audienceRow} data-audience-roles="">
          {LV2_QUALIFICATION_AUDIENCE.labels.map((label) => (
            <li key={label} className={styles.audienceLabel}>
              {label}
            </li>
          ))}
        </ul>
        <p className={styles.audienceSupport}>{LV2_QUALIFICATION_AUDIENCE.support}</p>
      </motion.footer>
    </section>
  )
}
