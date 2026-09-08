import { useEffect } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Layers3, UserRound } from 'lucide-react'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import { clearPhoneSecurityMorph } from '@/features/landing-v2/security-history/mobilePhoneExitClock'
import {
  LV2_HISTORY_COMPACT_VISIBLE_ROWS,
  LV2_HISTORY_COPY,
  LV2_HISTORY_SEASONS,
  LV2_SECURITY_COPY,
  LV2_SECURITY_MICRO_POINTS,
  historySeasonCompactView,
} from '@/features/landing-v2/security-history/securityHistoryClaims'
import { SecurityLockGraphic } from '@/features/landing-v2/security-history/SecurityLockGraphic'
import styles from './LandingV2SecurityHistoryStory.module.css'

function ClientMark() {
  return <UserRound className={styles.mark} aria-hidden strokeWidth={1.4} />
}

/**
 * Compact / reduced-motion Security + Studio History — natural document flow.
 *
 * Desktop normal motion: absorbed. Sticky Security/History live in MobileStory.
 * Compact (3H / 3H.1): Security + History + years are ONE normal-flow sibling
 * after the phone sticky. Phone uncovers Security via document overlap +
 * stacking — no phone→lock morph, no sticky year preview.
 * Reduced-motion: History intro + years (Security stays in MobileStory static).
 */
export function LandingV2SecurityHistoryStory() {
  const reduced = useReducedMotion()
  const isCompact = useLandingCompactViewport()
  const flow = Boolean(reduced) || isCompact
  /** Compact tour path owns Security here; PRM uses MobileStory static Security. */
  const showSecurity = isCompact && !reduced

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

  return (
    <section
      className={styles.flow}
      data-testid="lv2-security-history-story"
      data-security-theater="document-flow"
      data-studio-history-flow="document"
      data-studio-history-compact="true"
      data-compact-native-security={showSecurity ? '3h1' : 'false'}
      data-studio-history-years-only="false"
      data-studio-history-visible-rows={LV2_HISTORY_COMPACT_VISIBLE_ROWS}
      aria-labelledby={
        showSecurity ? 'lv2-security-heading' : 'lv2-studio-history-heading'
      }
    >
      <div className={styles.inner}>
        {showSecurity ? (
          <section
            className={styles.securitySection}
            data-compact-security-section=""
            data-security-sticky="0"
            data-security-under-phone="true"
            aria-labelledby="lv2-security-heading"
          >
            <div className={styles.securityInner} data-security-inner="">
              <div className={styles.securityLockWrap} data-security-lock="">
                <SecurityLockGraphic className={styles.securityLock} />
              </div>
              <p className={styles.securityEyebrow} data-security-eyebrow="">
                {LV2_SECURITY_COPY.eyebrow}
              </p>
              <h2
                id="lv2-security-heading"
                className={styles.securityHeadline}
                data-security-headline=""
              >
                {LV2_SECURITY_COPY.headline}
              </h2>
              <p className={styles.securitySupport} data-security-support="">
                {LV2_SECURITY_COPY.support}
              </p>
              <ul className={styles.securityMicro} data-security-micro="">
                {LV2_SECURITY_MICRO_POINTS.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <div className={styles.historySection} data-studio-history-intro="">
          {isCompact ? (
            <div className={styles.iconWrap} data-studio-history-icon="layers3">
              <Layers3
                className={styles.historyIcon}
                aria-hidden
                strokeWidth={1.5}
              />
            </div>
          ) : (
            <div className={styles.iconWrap} data-studio-lock-flow="">
              <SecurityLockGraphic className={styles.historyIcon} />
            </div>
          )}

          <p className={styles.studioLabel} data-studio-eyebrow="">
            {LV2_HISTORY_COPY.studioLabel}
          </p>

          <h2
            id="lv2-studio-history-heading"
            className={styles.historyHeadline}
            data-studio-headline=""
          >
            <span className={styles.historyLine}>{LV2_HISTORY_COPY.headlineLine1}</span>
            <span className={styles.historyLine}>{LV2_HISTORY_COPY.headlineLine2}</span>
          </h2>

          <p className={styles.historySupport} data-studio-support="">
            {LV2_HISTORY_COPY.support}
          </p>
        </div>

        <div className={styles.yearList} data-studio-year-list="">
          {seasons.map((season) => (
            <section
              key={season.year}
              className={styles.yearChapter}
              data-season-year={season.year}
              data-studio-year-chapter={season.year}
            >
              <p className={styles.year} data-studio-year-label="">
                {season.year}
              </p>

              <div
                className={styles.card}
                data-studio-card=""
                data-studio-card-rows={season.records.length}
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
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}
