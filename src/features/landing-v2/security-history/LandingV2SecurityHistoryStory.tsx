import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { clearPhoneSecurityMorph } from '@/features/landing-v2/security-history/mobilePhoneExitClock'
import {
  LV2_HISTORY_COPY,
  LV2_HISTORY_SEASONS,
} from '@/features/landing-v2/security-history/securityHistoryClaims'
import styles from './LandingV2SecurityHistoryStory.module.css'

/**
 * Compact / reduced-motion fallback only.
 *
 * Scroll-theater Studio History is owned by LandingV2MobileStory
 * (same HeroPhoneFrame lock). This section must NOT paint a second lock
 * or a competing sticky history scene.
 */
export function LandingV2SecurityHistoryStory() {
  const reduced = useReducedMotion()
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)')
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    clearPhoneSecurityMorph()
    return () => clearPhoneSecurityMorph()
  }, [])

  const simple = Boolean(reduced) || compact

  if (!simple) {
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

  return (
    <section
      className={styles.static}
      data-testid="lv2-security-history-story"
      data-security-theater="static"
      aria-labelledby="lv2-studio-history-heading"
    >
      <div className={styles.staticInner}>
        <p className={styles.studioLabel}>{LV2_HISTORY_COPY.studioLabel}</p>
        <h2 id="lv2-studio-history-heading" className={styles.historyHeadline}>
          <span className={styles.historyLine}>{LV2_HISTORY_COPY.headlineLine1}</span>
          <span className={styles.historyLine}>{LV2_HISTORY_COPY.headlineLine2}</span>
        </h2>
        <p className={styles.historySupport}>{LV2_HISTORY_COPY.support}</p>
        <div className={styles.seasons} data-studio-seasons="">
          {LV2_HISTORY_SEASONS.map((season) => (
            <div key={season.year} className={styles.seasonCol} data-season-year={season.year}>
              <p className={styles.year}>{season.year}</p>
              <ul className={styles.records}>
                {season.records.map((row) => (
                  <li key={`${season.year}-${row.couple}`}>
                    <span className={styles.couple}>{row.couple}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.footer}>{season.footer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
