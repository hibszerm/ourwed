import type { CSSProperties, ReactNode } from 'react'
import {
  IPHONE_DEVICE_RATIO,
  IPHONE_PERSPECTIVE,
} from '@/features/landing-v3/motion/mobileWeddingDaySequence'
import styles from './IPhoneMockup.module.css'

type Props = {
  size: 'primary' | 'secondary'
  children: ReactNode
  className?: string
  entered?: boolean
  narrow?: boolean
}

/**
 * Original generic iPhone-style mockup.
 * Body / bezel / display are separate. All content clips in .phoneDisplayMask.
 */
export function IPhoneMockup({
  size,
  children,
  className = '',
  entered = true,
  narrow = false,
}: Props) {
  const perspective =
    size === 'primary'
      ? narrow
        ? IPHONE_PERSPECTIVE.mobilePrimary
        : IPHONE_PERSPECTIVE.primary
      : narrow
        ? IPHONE_PERSPECTIVE.mobileSecondary
        : IPHONE_PERSPECTIVE.secondary

  return (
    <div
      className={`${styles.perspective} ${className}`}
      data-iphone-mockup={size}
      data-device-ratio={IPHONE_DEVICE_RATIO.token}
      data-phone-layers="body-bezel-display"
      data-rotate-z={String(perspective.rotateZ)}
      data-rotate-y={String(perspective.rotateY)}
      aria-hidden="true"
      style={
        {
          '--phone-rz': `${perspective.rotateZ}deg`,
          '--phone-ry': `${perspective.rotateY}deg`,
        } as CSSProperties
      }
    >
      <div
        className={`${styles.device} ${styles[size]} ${entered ? styles.entered : styles.pending}`}
      >
        <div className={styles.body} data-phone-layer="body">
          {size === 'primary' ? (
            <>
              <span className={styles.mute} data-phone-detail="mute" />
              <span className={styles.volumeUp} data-phone-detail="volume" />
              <span className={styles.volumeDown} data-phone-detail="volume" />
              <span className={styles.power} data-phone-detail="power" />
            </>
          ) : null}
          <span className={styles.edgeHighlight} aria-hidden />

          <div className={styles.bezel} data-phone-layer="bezel">
            <div className={styles.island} data-phone-detail="island" />

            <div
              className={styles.phoneDisplayMask}
              data-phone-layer="display"
              data-display-mask="true"
            >
              {children}
            </div>

            <div className={styles.homeIndicator} aria-hidden />
          </div>
        </div>
      </div>
    </div>
  )
}
