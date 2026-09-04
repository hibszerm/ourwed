import type { MotionValue } from 'framer-motion'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { karolinaJan } from '@/features/landing-v2/narrative/karolinaJan'
import {
  LIFECYCLE_RANGES,
  easeOutCubic,
  rangeT,
} from '@/features/landing-v2/lifecycle-story/lifecycleStoryProgress'
import styles from './LifecycleLinkObject.module.css'

type Props = {
  /** Master lifecycle progress. When omitted (static), show full capsule. */
  progress?: MotionValue<number>
}

/** Refined horizontal link capsule — not a CTA card. */
export function LifecycleLinkObject({ progress }: Props) {
  const n = karolinaJan
  const r = LIFECYCLE_RANGES
  const fallback = useMotionValue(0)
  const p = progress ?? fallback
  const settled = !progress

  /*
   * ONE shared exit clock for the entire compact capsule content:
   * eyebrow + Karolina & Jan + date + URL.
   * No separate clocks — no leftover independent labels mid-expand.
   */
  const sourceExitT = useTransform(p, (v) =>
    easeOutCubic(rangeT(v, r.sourceExit.start, r.sourceExit.end)),
  )

  const sourceOpacity = useTransform(sourceExitT, (t) => 1 - t)
  const sourceScale = useTransform(sourceExitT, (t) => 1 - t * 0.015)
  const sourceY = useTransform(sourceExitT, (t) => -t * 2)

  const sourceStyle = settled
    ? undefined
    : {
        opacity: sourceOpacity,
        scale: sourceScale,
        y: sourceY,
      }

  return (
    <div className={styles.root} data-lifecycle-link="">
      <motion.p
        className={styles.eyebrow}
        data-lifecycle-link-eyebrow=""
        style={sourceStyle}
      >
        {n.questionnaire.eyebrow}
      </motion.p>

      <div className={styles.meta}>
        <motion.span
          className={styles.couple}
          data-lifecycle-link-couple=""
          style={sourceStyle}
        >
          <span className={styles.token} data-lc-src="karolina">
            {n.couple.brideFirst}
          </span>
          <span className={styles.amp} aria-hidden>
            {' '}
            &{' '}
          </span>
          <span className={styles.token} data-lc-src="jan">
            {n.couple.groomFirst}
          </span>
        </motion.span>
        <span className={styles.dot} aria-hidden>
          ·
        </span>
        <motion.span
          className={styles.date}
          data-lc-src="date"
          style={sourceStyle}
        >
          {n.wedding.longDate}
        </motion.span>
      </div>

      <motion.p
        className={styles.url}
        data-lifecycle-link-url=""
        style={sourceStyle}
      >
        {n.questionnaire.contractQuestionnaireUrl}
      </motion.p>
    </div>
  )
}
