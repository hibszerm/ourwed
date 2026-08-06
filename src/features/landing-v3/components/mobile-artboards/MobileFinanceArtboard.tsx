import type { CSSProperties } from 'react'
import {
  DEMO_ASSIGNMENT,
  DEMO_SEASON,
} from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import styles from './mobileArtboard.module.css'

const MAX_MONTH = Math.max(...DEMO_SEASON.months.map((m) => m.amount))

/** Pattern B — compact finance bento (not tall card stack). */
export function MobileFinanceArtboard() {
  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={`${styles.board} ${styles.financeBoard}`}
          data-mobile-artboard="finance"
          data-artboard-pattern="B"
          data-reveal-active={active ? 'true' : 'false'}
          style={
            {
              '--paid': `${DEMO_ASSIGNMENT.paidPercent}%`,
            } as CSSProperties
          }
        >
          <div className={styles.finPrimary}>
            <span>{DEMO_ASSIGNMENT.displayName}</span>
            <strong>{DEMO_ASSIGNMENT.contractValueLabel}</strong>
            <span>Wartość umowy</span>
            <div className={styles.finRail} data-active={active ? 'true' : 'false'}>
              <i className={styles.finRailFill} aria-hidden />
            </div>
          </div>

          <div className={styles.finRow2}>
            <div className={styles.finHalf}>
              <span>Wpłacono</span>
              <strong>{DEMO_ASSIGNMENT.paidLabel}</strong>
            </div>
            <div className={styles.finHalf}>
              <span>Pozostało</span>
              <strong>{DEMO_ASSIGNMENT.remainingLabel}</strong>
            </div>
          </div>

          <div className={styles.finSeason}>
            <span>{DEMO_SEASON.yearLabel}</span>
            <div
              className={styles.finBars}
              data-active={active ? 'true' : 'false'}
              aria-hidden
            >
              {DEMO_SEASON.months.map((m) => (
                <i
                  key={m.id}
                  className={styles.finBar}
                  style={{ height: `${Math.max(18, (m.amount / MAX_MONTH) * 100)}%` }}
                />
              ))}
            </div>
          </div>

          <div className={styles.finRow4}>
            <div className={styles.finMini}>
              <span>Najbliższa płatność</span>
              <strong>{DEMO_ASSIGNMENT.remainingLabel}</strong>
              <span>{DEMO_ASSIGNMENT.finalDueLabel}</span>
            </div>
            <div className={styles.finMini}>
              <span>Aktywne zlecenia</span>
              <strong>{DEMO_SEASON.activeCount}</strong>
              <span>Sezon 2027</span>
            </div>
          </div>
        </div>
      )}
    </MobileRevealAnchor>
  )
}
