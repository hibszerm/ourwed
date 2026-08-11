import { motion, useReducedMotion } from 'framer-motion'
import { DesktopCompositionScale } from '@/features/landing-v3/components/DesktopCompositionScale'
import {
  DEMO_ASSIGNMENT,
  DEMO_FINANCE_PAYMENTS,
  DEMO_SEASON,
} from '@/features/landing-v3/data/demoData'
import { useLandingViewportMode } from '@/features/landing-v3/hooks/useLandingViewportMode'
import { useSectionReveal } from '@/features/landing-v3/hooks/useSectionReveal'
import { premiumEase } from '@/features/landing-v3/motion/variants'
import styles from '@/features/landing-v3/styles/landingV3.module.css'

const DESKTOP_THRESHOLD = 0.55

const MAX_MONTH = Math.max(...DEMO_SEASON.months.map((m) => m.amount))

/** Section 3 — finances bento (12-col). */
export function FinanceSection() {
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
      className={`${styles.editorialSection} ${styles.editorialSectionTight}`}
      data-composition="bento"
      data-finance-layout="bento-4"
      data-testid="lv3-finance-section"
      data-viewport-mode={viewport}
      aria-labelledby="finance-title"
    >
      <div className={styles.sectionIntro}>
        <h2 id="finance-title" className={styles.titleA}>
          Wiesz, ile wpłynęło.
          <br />
          I ile jeszcze pozostało.
        </h2>
        <p className={styles.editorialLead}>
          Kontrolujesz konkretne zlecenie, najbliższą płatność i kondycję całego
          sezonu.
        </p>
      </div>

      <DesktopCompositionScale composition="finance">
        <div className={styles.financeBento} data-landing-preview="">
          <article className={styles.financeCardA} data-finance-module="assignment">
            <p className={styles.surfaceEyebrow}>{DEMO_ASSIGNMENT.displayName}</p>
            <div className={styles.financeTotals}>
              <div>
                <strong>{DEMO_ASSIGNMENT.contractValueLabel}</strong>
                <span>Wartość umowy</span>
              </div>
              <div>
                <strong>{DEMO_ASSIGNMENT.paidLabel}</strong>
                <span>Wpłacono</span>
              </div>
              <div>
                <strong>{DEMO_ASSIGNMENT.remainingLabel}</strong>
                <span>Pozostało</span>
              </div>
            </div>
            <div className={styles.progressRail} aria-hidden>
              <motion.div
                className={styles.progressFill}
                initial={false}
                animate={{ width: active ? `${DEMO_ASSIGNMENT.paidPercent}%` : '0%' }}
                transition={{ duration: reduced ? 0 : 0.55, ease: premiumEase }}
              />
            </div>
            <ul className={styles.paymentList}>
              {DEMO_FINANCE_PAYMENTS.map((p) => (
                <li key={p.id} data-status={p.status}>
                  <span>{p.label}</span>
                  <strong>{p.amountLabel}</strong>
                  <em>{p.status === 'due' ? 'Termin 5 czerwca' : p.statusLabel}</em>
                </li>
              ))}
            </ul>
          </article>

          <article className={styles.financeCardB} data-finance-module="season">
            <p className={styles.surfaceEyebrow}>{DEMO_SEASON.yearLabel}</p>
            <div className={styles.seasonTotals}>
              <div>
                <strong>{DEMO_SEASON.contractedLabel}</strong>
                <span>Zakontraktowano</span>
              </div>
              <div>
                <strong>{DEMO_SEASON.paidLabel}</strong>
                <span>Wpłacono</span>
              </div>
              <div>
                <strong>{DEMO_SEASON.remainingLabel}</strong>
                <span>Do otrzymania</span>
              </div>
              <div>
                <strong>{DEMO_SEASON.activeCount}</strong>
                <span>Aktywnych zleceń</span>
              </div>
            </div>
            <div className={styles.monthRails} aria-hidden>
              {DEMO_SEASON.months.map((m, i) => (
                <div key={m.id} className={styles.monthRail}>
                  <motion.div
                    className={styles.monthFill}
                    initial={false}
                    animate={{
                      height: active
                        ? `${Math.round((m.amount / MAX_MONTH) * 100)}%`
                        : '0%',
                    }}
                    transition={{
                      duration: reduced ? 0 : 0.45,
                      delay: reduced ? 0 : 0.1 + i * 0.04,
                      ease: premiumEase,
                    }}
                  />
                  <span>{m.label.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.financeCardC} data-finance-module="next">
            <p className={styles.surfaceEyebrow}>Najbliższa płatność</p>
            <p className={styles.nextDate}>{DEMO_ASSIGNMENT.finalDueLabel}</p>
            <p className={styles.nextAmount}>{DEMO_ASSIGNMENT.remainingLabel}</p>
            <p className={styles.nextCouple}>{DEMO_ASSIGNMENT.displayName}</p>
          </article>

          <article className={styles.financeCardD} data-finance-module="month">
            <p className={styles.surfaceEyebrow}>Czerwiec</p>
            <p className={styles.monthCount}>4 zlecenia</p>
            <p className={styles.monthValue}>
              {DEMO_SEASON.monthFocus.valueLabel}
            </p>
          </article>
        </div>
      </DesktopCompositionScale>
    </section>
  )
}
