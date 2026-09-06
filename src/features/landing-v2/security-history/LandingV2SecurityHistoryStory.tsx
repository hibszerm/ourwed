import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { UserRound } from 'lucide-react'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import { clearPhoneSecurityMorph } from '@/features/landing-v2/security-history/mobilePhoneExitClock'
import {
  LV2_HISTORY_COMPACT_VISIBLE_ROWS,
  LV2_HISTORY_COPY,
  LV2_HISTORY_SEASONS,
  historySeasonCompactView,
} from '@/features/landing-v2/security-history/securityHistoryClaims'
import { SecurityLockGraphic } from '@/features/landing-v2/security-history/SecurityLockGraphic'
import styles from './LandingV2SecurityHistoryStory.module.css'

const COMPACT_EASE = [0.22, 1, 0.36, 1] as const

/** Features-proven IO band — reveal once the top enters the lower reading zone. */
const YEAR_VIEWPORT = { once: true as const, amount: 0.05, margin: '0px 0px -22% 0px' }
const INTRO_VIEWPORT = { once: true as const, amount: 0.2, margin: '0px 0px -18% 0px' }

function ClientMark() {
  return <UserRound className={styles.mark} aria-hidden strokeWidth={1.4} />
}

/**
 * Compact / reduced-motion Studio History — natural document flow.
 *
 * Desktop normal motion: absorbed. Sticky 3-column History lives in MobileStory.
 * Compact: cinematic Security releases, then this section scrolls with the page.
 */
export function LandingV2SecurityHistoryStory() {
  const reduced = useReducedMotion()
  const isCompact = useLandingCompactViewport()
  const flow = Boolean(reduced) || isCompact

  useEffect(() => {
    clearPhoneSecurityMorph()
    return () => clearPhoneSecurityMorph()
  }, [])

  if (!flow) {
    return (
      <section
        className={styles.absorbed}
        data-testid="lv2-security-history-story"
        data-security-theater="absorbed"
        data-security-history-role="studio-history-only"
        aria-hidden="true"
      />
    )
  }

  const seasons = LV2_HISTORY_SEASONS.map((season) => historySeasonCompactView(season))
  const motionOff = Boolean(reduced)

  return (
    <section
      className={styles.flow}
      data-testid="lv2-security-history-story"
      data-security-theater="document-flow"
      data-studio-history-flow="document"
      data-studio-history-compact="true"
      data-studio-history-visible-rows={LV2_HISTORY_COMPACT_VISIBLE_ROWS}
      aria-labelledby="lv2-studio-history-heading"
    >
      <div className={styles.inner}>
        <div className={styles.intro} data-studio-history-intro="">
          <motion.div
            className={styles.lockWrap}
            data-studio-lock-flow=""
            initial={motionOff ? false : { opacity: 0, y: 10 }}
            whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
            viewport={INTRO_VIEWPORT}
            transition={{ duration: 0.75, ease: COMPACT_EASE }}
          >
            <SecurityLockGraphic className={styles.lock} />
          </motion.div>

          <motion.p
            className={styles.studioLabel}
            data-studio-eyebrow=""
            initial={motionOff ? false : { opacity: 0, y: 8 }}
            whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
            viewport={INTRO_VIEWPORT}
            transition={{ duration: 0.75, ease: COMPACT_EASE, delay: 0.04 }}
          >
            {LV2_HISTORY_COPY.studioLabel}
          </motion.p>

          <motion.h2
            id="lv2-studio-history-heading"
            className={styles.historyHeadline}
            data-studio-headline=""
            initial={motionOff ? false : { opacity: 0, y: 14 }}
            whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
            viewport={INTRO_VIEWPORT}
            transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.08 }}
          >
            <span className={styles.historyLine}>{LV2_HISTORY_COPY.headlineLine1}</span>
            <span className={styles.historyLine}>{LV2_HISTORY_COPY.headlineLine2}</span>
          </motion.h2>

          <motion.p
            className={styles.historySupport}
            data-studio-support=""
            initial={motionOff ? false : { opacity: 0, y: 10 }}
            whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
            viewport={INTRO_VIEWPORT}
            transition={{ duration: 0.8, ease: COMPACT_EASE, delay: 0.14 }}
          >
            {LV2_HISTORY_COPY.support}
          </motion.p>
        </div>

        <div className={styles.yearList} data-studio-year-list="">
          {seasons.map((season) => (
            <section
              key={season.year}
              className={styles.yearChapter}
              data-season-year={season.year}
              data-studio-year-chapter={season.year}
            >
              <motion.p
                className={styles.year}
                data-studio-year-label=""
                initial={motionOff ? false : { opacity: 0, y: 10 }}
                whileInView={motionOff ? undefined : { opacity: 1, y: 0 }}
                viewport={YEAR_VIEWPORT}
                transition={{ duration: 0.8, ease: COMPACT_EASE }}
              >
                {season.year}
              </motion.p>

              <motion.div
                className={styles.card}
                data-studio-card=""
                data-studio-card-rows={season.records.length}
                initial={motionOff ? false : { opacity: 0, y: 20, scale: 0.995 }}
                whileInView={motionOff ? undefined : { opacity: 1, y: 0, scale: 1 }}
                viewport={YEAR_VIEWPORT}
                transition={{ duration: 0.82, ease: COMPACT_EASE }}
              >
                <ul className={styles.records}>
                  {season.records.map((row) => (
                    <li key={`${season.year}-${row.couple}`} className={styles.row}>
                      <span className={styles.rowLead} aria-hidden>
                        <ClientMark />
                      </span>
                      <span className={styles.couple}>{row.couple}</span>
                      <span className={styles.rowTrail} aria-hidden />
                    </li>
                  ))}
                </ul>
                <p className={styles.footer} data-studio-card-footer="">
                  {season.footer}
                </p>
              </motion.div>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}
