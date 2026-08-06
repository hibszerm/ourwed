import type { CSSProperties } from 'react'
import {
  DEMO_ASSIGNMENT,
  DEMO_SEASON,
} from '@/features/landing-v3/data/demoData'
import { MobileRevealAnchor } from '@/features/landing-v3/components/MobileRevealAnchor'
import styles from './mobileArtboard.module.css'

const MAX_MONTH = Math.max(...DEMO_SEASON.months.map((m) => m.amount))

/** Parity artboard — desktop finance bento hierarchy. */
export function MobileFinanceArtboard() {
  return (
    <MobileRevealAnchor>
      {(active) => (
        <div
          className={styles.financeBoard}
          data-mobile-artboard="finance"
          data-artboard-pattern="parity-B"
          data-reveal-active={active ? 'true' : 'false'}
          style={
            {
              '--paid': `${DEMO_ASSIGNMENT.paidPercent}%`,
            } as CSSProperties
          }
        >
          <div className={styles.finPrimary} data-dominant="true">
            <span className={styles.eyebrow}>{DEMO_ASSIGNMENT.displayName}</span>
            <strong>{DEMO_ASSIGNMENT.contractValueLabel}</strong>
            <span className={styles.meta}>Wartość umowy</span>
            <div
              className={styles.finRail}
              data-active={active ? 'true' : 'false'}
            >
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
            <strong>{DEMO_SEASON.contractedLabel}</strong>
            <span>Zakontraktowano</span>
            <div
              className={styles.finBars}
              data-active={active ? 'true' : 'false'}
              aria-hidden
            >
              {DEMO_SEASON.months.map((m) => (
                <i
                  key={m.id}
                  className={styles.finBar}
                  style={{
                    height: `${Math.max(18, (m.amount / MAX_MONTH) * 100)}%`,
                  }}
                />
              ))}
            </div>
            <div className={styles.finBarLabel}>
              <span>Sty</span>
              <span>Cze</span>
            </div>
          </div>

          <div className={styles.finRow4}>
            <div className={styles.finMini}>
              <span>Najbliższa wpłata</span>
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
