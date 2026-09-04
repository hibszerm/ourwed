import type { MotionValue } from 'framer-motion'
import type { ReactNode } from 'react'
import styles from './HeroTabletFrame.module.css'

type Props = {
  children: ReactNode
  /** Narrower / simplified hardware for mobile crop. */
  compact?: boolean
  /**
   * 0 = product surface only (no recognizable hardware).
   * 1 = full landscape iPad enclosure.
   * Omit to inherit `--hardware-progress` from a parent (scroll theater).
   * Static theater / reduced-motion should pass 1.
   */
  hardwareProgress?: number
  /**
   * Screen blackout 0–1 — clipped to the display only (not bezel/body).
   * Prefer driving via parent CSS `--screen-blackout` MotionValue.
   */
  blackout?: number
  className?: string
}

/**
 * Landscape iPad-like hardware — three material levels only:
 * dark aluminum chassis → black bezel → screen.
 * Buttons are children of `.device` and overlap the chassis edge.
 * Entire device must be scaled from one outer wrapper (never piecemeal).
 */
export function HeroTabletFrame({
  children,
  compact = false,
  hardwareProgress,
  blackout,
  className,
}: Props) {
  const inherit = hardwareProgress === undefined
  const hw = inherit ? undefined : Math.min(1, Math.max(0, hardwareProgress))
  const bo =
    blackout === undefined ? undefined : Math.min(1, Math.max(0, blackout))

  return (
    <div
      className={[styles.device, className].filter(Boolean).join(' ')}
      data-testid="lv2-hero-tablet"
      data-compact={compact ? 'true' : 'false'}
      data-hardware={
        inherit ? 'inherit' : hw! >= 0.98 ? 'complete' : hw! <= 0.02 ? 'hidden' : 'revealing'
      }
      style={{
        ...(hw === undefined
          ? undefined
          : { ['--hardware-progress' as string]: hw }),
        ...(bo === undefined
          ? undefined
          : { ['--screen-blackout' as string]: bo }),
      }}
      aria-hidden
    >
      <span className={styles.powerButton} data-tablet-btn="power" />
      <span className={styles.volumeUp} data-tablet-btn="vol-up" />
      <span className={styles.volumeDown} data-tablet-btn="vol-down" />

      <div className={styles.cameraCluster} data-tablet-camera="">
        <span className={styles.sensor} />
        <span className={styles.lens} />
        <span className={styles.sensor} />
      </div>

      <div className={styles.bezel} data-tablet-bezel="">
        <div className={styles.screen} data-tablet-screen="">
          {children}
          <div className={styles.screenBlackout} data-tablet-blackout="" />
        </div>
      </div>
    </div>
  )
}

/** Re-export for callers that type MotionValue blackout via CSS vars. */
export type HeroTabletBlackout = number | MotionValue<number>
