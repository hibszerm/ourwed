import type { CSSProperties, ReactNode } from 'react'
import styles from './DeviceFrame.module.css'

export type DeviceMorph = number // 0 = laptop open, 1 = phone

type DeviceFrameProps = {
  /** 0 closed → 1 fully open (laptop lid). */
  lidOpen?: number
  /** 0 laptop → 1 phone morph. */
  morph?: DeviceMorph
  /** Screen brightness 0–1 (boot glow). */
  screenOn?: number
  children?: ReactNode
  className?: string
  /** Show closed laptop silhouette (lid covers screen). */
  mode?: 'laptop' | 'phone'
}

/**
 * Elegant wireframe devices — thin strokes, no real 3D models.
 * Controlled entirely via CSS custom properties for GSAP scrub.
 */
export function DeviceFrame({
  lidOpen = 1,
  morph = 0,
  screenOn = 1,
  children,
  className,
  mode,
}: DeviceFrameProps) {
  const effectiveMorph = mode === 'phone' ? 1 : mode === 'laptop' ? 0 : morph
  const style = {
    '--lid': String(Math.max(0, Math.min(1, lidOpen))),
    '--morph': String(Math.max(0, Math.min(1, effectiveMorph))),
    '--screen-on': String(Math.max(0, Math.min(1, screenOn))),
  } as CSSProperties

  return (
    <div
      className={`${styles.stage} ${className ?? ''}`}
      style={style}
      aria-hidden
    >
      <div className={styles.device}>
        <div className={styles.lid}>
          <div className={styles.bezel}>
            <div className={styles.camera} />
            <div className={styles.screen}>
              <div className={styles.screenGlow} />
              <div className={styles.screenContent}>{children}</div>
              <div className={styles.screenOff} />
            </div>
          </div>
        </div>
        <div className={styles.base}>
          <div className={styles.hinge} />
          <div className={styles.deck} />
          <div className={styles.notch} />
        </div>
        <div className={styles.phoneChin} />
      </div>
    </div>
  )
}
