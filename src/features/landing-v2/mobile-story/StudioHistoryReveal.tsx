import { motion, type MotionValue, useTransform } from 'framer-motion'
import { UserRound } from 'lucide-react'
import {
  LV2_HISTORY_COPY,
  LV2_HISTORY_SEASONS,
} from '@/features/landing-v2/security-history/securityHistoryClaims'
import {
  seasonImportHistoryShellOpAt,
  seasonImportHistoryShellScaleAt,
  seasonImportHistoryShellYAt,
} from '@/features/landing-v2/mobile-story/seasonImportProgress'
import {
  studioCardsOpAt,
  studioEyebrowOpAt,
  studioHeadlineOpAt,
  studioLockSettledGateAt,
  studioRevealYAt,
  studioSupportOpAt,
  studioTimelineOpAt,
  studioYear2026OpAt,
  studioYear2027OpAt,
  studioYear2028OpAt,
} from '@/features/landing-v2/mobile-story/studioHistoryProgress'
import styles from './StudioHistoryReveal.module.css'

type Props = {
  progress: MotionValue<number>
  /** Season-import chapter progress. 0 = history final frame unchanged. */
  exitProgress: MotionValue<number>
}

/** Hard paint kill — opacity:0 alone can leave Safari compositor ghosts. */
function paintVisibility(opacity: number): 'hidden' | 'visible' {
  return opacity < 0.02 ? 'hidden' : 'visible'
}

/** Subtle client/person mark — outline UserRound (not couple/face glyph). */
function ClientMark() {
  return <UserRound className={styles.mark} aria-hidden strokeWidth={1.4} />
}

/**
 * Desktop Studio History — sticky three-column chronology.
 * Compact document-flow History lives in LandingV2SecurityHistoryStory.
 */
export function StudioHistoryReveal({ progress, exitProgress }: Props) {
  const shellOp = useTransform(exitProgress, (p) => seasonImportHistoryShellOpAt(p))
  const shellY = useTransform(exitProgress, (p) => {
    const op = seasonImportHistoryShellOpAt(p)
    return op < 0.02 ? 0 : seasonImportHistoryShellYAt(p)
  })
  const shellScale = useTransform(exitProgress, (p) => {
    const op = seasonImportHistoryShellOpAt(p)
    return op < 0.02 ? 1 : seasonImportHistoryShellScaleAt(p)
  })
  const shellVis = useTransform(shellOp, (o) => paintVisibility(Number(o)))

  const introGate = useTransform(progress, (p) => studioLockSettledGateAt(p))
  const introVisibility = useTransform(introGate, (g) => paintVisibility(Number(g)))

  const eyebrowOp = useTransform(progress, (p) => studioEyebrowOpAt(p))
  const eyebrowY = useTransform(eyebrowOp, (op) => {
    const o = Number(op)
    return o < 0.02 ? 0 : studioRevealYAt(Math.min(1, o))
  })
  const eyebrowVisibility = useTransform(eyebrowOp, (o) => paintVisibility(Number(o)))

  const headlineOp = useTransform(progress, (p) => studioHeadlineOpAt(p))
  const headlineY = useTransform(headlineOp, (op) => {
    const o = Number(op)
    return o < 0.02 ? 0 : studioRevealYAt(Math.min(1, o))
  })
  const headlineVisibility = useTransform(headlineOp, (o) => paintVisibility(Number(o)))

  const supportOp = useTransform(progress, (p) => studioSupportOpAt(p))
  const supportY = useTransform(supportOp, (op) => {
    const o = Number(op)
    return o < 0.02 ? 0 : studioRevealYAt(Math.min(1, o))
  })
  const supportVisibility = useTransform(supportOp, (o) => paintVisibility(Number(o)))

  const timelineOp = useTransform(progress, (p) => studioTimelineOpAt(p))
  const timelineScaleX = useTransform(progress, (p) => 0.12 + studioTimelineOpAt(p) * 0.88)
  const timelineVisibility = useTransform(timelineOp, (o) => paintVisibility(Number(o)))

  const y2026 = useTransform(progress, (p) => studioYear2026OpAt(p))
  const y2027 = useTransform(progress, (p) => studioYear2027OpAt(p))
  const y2028 = useTransform(progress, (p) => studioYear2028OpAt(p))
  const cardsOp = useTransform(progress, (p) => studioCardsOpAt(p))
  const cardsVisibility = useTransform(cardsOp, (o) => paintVisibility(Number(o)))

  const yearOps = [y2026, y2027, y2028]
  const yearVisibility = [
    useTransform(y2026, (o) => paintVisibility(Number(o))),
    useTransform(y2027, (o) => paintVisibility(Number(o))),
    useTransform(y2028, (o) => paintVisibility(Number(o))),
  ]

  return (
    <motion.div
      className={styles.root}
      data-studio-history=""
      data-studio-history-owner="mobile"
      data-studio-history-compact="false"
      style={{
        x: '-50%',
        y: shellY,
        scale: shellScale,
        opacity: shellOp,
        visibility: shellVis,
      }}
    >
      <div className={styles.heroLead} data-lv2-history-hero="">
        <div className={styles.lockSlot} data-studio-lock-slot="" aria-hidden />

        <motion.div
          className={styles.intro}
          data-studio-history-intro=""
          style={{ visibility: introVisibility }}
        >
          <motion.p
            className={styles.eyebrow}
            data-studio-eyebrow=""
            style={{ opacity: eyebrowOp, y: eyebrowY, visibility: eyebrowVisibility }}
          >
            {LV2_HISTORY_COPY.studioLabel}
          </motion.p>

          <motion.h2
            id="lv2-studio-history-heading"
            className={styles.headline}
            data-studio-headline=""
            style={{ opacity: headlineOp, y: headlineY, visibility: headlineVisibility }}
          >
            <span className={styles.line}>{LV2_HISTORY_COPY.headlineLine1}</span>
            <span className={styles.line}>{LV2_HISTORY_COPY.headlineLine2}</span>
          </motion.h2>
          <motion.p
            className={styles.support}
            data-studio-support=""
            style={{ opacity: supportOp, y: supportY, visibility: supportVisibility }}
          >
            {LV2_HISTORY_COPY.support}
          </motion.p>
        </motion.div>
      </div>

      <motion.div
        className={styles.timeline}
        data-studio-timeline=""
        style={{ opacity: timelineOp, scaleX: timelineScaleX, visibility: timelineVisibility }}
        aria-hidden
      >
        <span className={styles.timelineLine} />
        {LV2_HISTORY_SEASONS.map((season) => (
          <span key={season.year} className={styles.dot} data-studio-year-dot={season.year} />
        ))}
      </motion.div>

      <motion.div
        className={styles.seasons}
        data-studio-seasons=""
        data-studio-year-list=""
        style={{
          opacity: cardsOp,
          visibility: cardsVisibility,
        }}
      >
        {LV2_HISTORY_SEASONS.map((season, i) => (
          <section
            key={season.year}
            className={styles.seasonCol}
            data-season-year={season.year}
            data-studio-year-chapter={season.year}
          >
            <motion.p
              className={styles.year}
              style={{
                opacity: yearOps[i],
                visibility: yearVisibility[i],
              }}
            >
              {season.year}
            </motion.p>
            <div className={styles.card} data-studio-card="">
              <ul className={styles.records}>
                {season.records.map((row) => (
                  <li key={`${season.year}-${row.couple}`}>
                    <ClientMark />
                    <span className={styles.couple}>{row.couple}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.footer}>{season.footer}</p>
            </div>
          </section>
        ))}
      </motion.div>
    </motion.div>
  )
}
