import type { ReactNode } from 'react'
import { motion, type MotionValue, useTransform } from 'framer-motion'
import {
  LockKeyhole,
  LockShackle,
} from '@/features/landing-v2/security-history/SecurityLockGraphic'
import {
  LOCK_ASPECT_RATIO,
  LOCK_BODY,
  PHONE_ASPECT_RATIO,
} from '@/features/landing-v2/security-history/securityHistoryProgress'
import styles from './HeroPhoneFrame.module.css'

export type PhoneLockMorphValues = {
  compress: MotionValue<number>
  chrome: MotionValue<number>
  brief: MotionValue<number>
  screenMerge: MotionValue<number>
  shackle: MotionValue<number>
  keyhole: MotionValue<number>
}

type Props = {
  children?: ReactNode
  className?: string
  /**
   * Always provided from MobileStory post-Brief timeline.
   * Primitives stay mounted; MotionValues sit at identity until morph.
   */
  lockMorph: PhoneLockMorphValues
  /**
   * Compact 3G.1: disable Stage-2 geometry morph (aspectRatio / radius / pad).
   * Phone clears via parent transform/opacity; lock is a separate layer.
   */
  geometryMorph?: boolean
}

/**
 * Portrait phone — chassis becomes the large security lock body (desktop).
 * Compact: geometryMorph=false keeps static phone chrome; no layout animation.
 */
export function HeroPhoneFrame({
  children,
  className,
  lockMorph,
  geometryMorph = true,
}: Props) {
  const aspectRatio = useTransform(
    lockMorph.compress,
    (c) =>
      geometryMorph
        ? PHONE_ASPECT_RATIO + (LOCK_ASPECT_RATIO - PHONE_ASPECT_RATIO) * Number(c)
        : PHONE_ASPECT_RATIO,
  )

  /* Continuous unit mix — no cqw↔px threshold that can thrash near compress≈0. */
  const chassisRadius = useTransform(lockMorph.compress, (c) => {
    if (!geometryMorph) return `${(88 / 430) * 100}cqw`
    const t = Number(c)
    const phoneCqw = (88 / 430) * 100 * (1 - t)
    const lockPx = LOCK_BODY.r * t
    return `calc(${phoneCqw.toFixed(4)}cqw + ${lockPx.toFixed(2)}px)`
  })

  const bezelRadius = useTransform(lockMorph.compress, (c) => {
    if (!geometryMorph) return `${(74 / 430) * 100}cqw`
    const t = Number(c)
    const phoneCqw = (74 / 430) * 100 * (1 - t)
    const lockPx = Math.max(8, LOCK_BODY.r - 6) * t
    return `calc(${phoneCqw.toFixed(4)}cqw + ${lockPx.toFixed(2)}px)`
  })

  const insetPad = useTransform(lockMorph.compress, (c) => {
    if (!geometryMorph) return `${(10 / 430) * 100}cqw`
    const t = Number(c)
    return `${((10 / 430) * 100 * (1 - t)).toFixed(4)}cqw`
  })

  const screenMergeOp = useTransform(lockMorph.screenMerge, (m) =>
    geometryMorph ? Math.min(1, Math.max(0, Number(m))) : 0,
  )
  const shackleScaleY = useTransform(lockMorph.shackle, (t) =>
    geometryMorph ? 0.22 + Number(t) * 0.78 : 0.22,
  )
  const shackleOp = useTransform(lockMorph.shackle, (t) =>
    geometryMorph ? Math.min(1, Number(t) * 1.15) : 0,
  )
  const keyholeScale = useTransform(lockMorph.keyhole, (t) =>
    geometryMorph ? 0.82 + Number(t) * 0.18 : 0.82,
  )
  const keyholeOp = useTransform(lockMorph.keyhole, (t) => (geometryMorph ? Number(t) : 0))
  const chromeOp = useTransform(lockMorph.chrome, (c) => (geometryMorph ? Number(c) : 1))
  const briefOp = useTransform(lockMorph.brief, (b) => (geometryMorph ? Number(b) : 1))

  return (
    <motion.div
      className={[styles.deviceRoot, className].filter(Boolean).join(' ')}
      data-testid="lv2-mobile-phone"
      data-mobile-phone=""
      data-phone-lock-morph={geometryMorph ? '' : undefined}
      data-phone-geometry-morph={geometryMorph ? 'true' : 'false'}
      data-security-morph-body={geometryMorph ? '' : undefined}
      style={{ aspectRatio }}
      aria-hidden
    >
      <motion.span
        className={styles.btnSilent}
        data-phone-btn="silent"
        style={{ opacity: chromeOp }}
      />
      <motion.span
        className={styles.btnVolUp}
        data-phone-btn="vol-up"
        style={{ opacity: chromeOp }}
      />
      <motion.span
        className={styles.btnVolDown}
        data-phone-btn="vol-down"
        style={{ opacity: chromeOp }}
      />
      <motion.span
        className={styles.btnPower}
        data-phone-btn="power"
        style={{ opacity: chromeOp }}
      />

      <motion.div
        className={styles.chassis}
        data-phone-chassis=""
        data-security-lock-chassis={geometryMorph ? '' : undefined}
        style={{
          borderRadius: chassisRadius,
          padding: insetPad,
        }}
      >
        <motion.div
          className={styles.bezel}
          data-phone-bezel=""
          style={{ borderRadius: bezelRadius }}
        >
          <motion.div
            className={styles.island}
            data-phone-island=""
            style={{ opacity: chromeOp }}
            aria-hidden
          >
            <span className={styles.islandLens} />
          </motion.div>

          <div className={styles.screen} data-phone-screen="">
            <motion.div className={styles.screenContent} style={{ opacity: briefOp }}>
              {children ?? <div className={styles.screenPlaceholder} data-phone-placeholder="" />}
            </motion.div>
            <motion.div
              className={styles.screenMerge}
              data-phone-screen-merge=""
              style={{ opacity: screenMergeOp }}
              aria-hidden
            />
          </div>
        </motion.div>

        <motion.div
          className={styles.keyholeWrap}
          data-security-lock-keyhole={geometryMorph ? 'true' : undefined}
          style={{ opacity: keyholeOp, scale: keyholeScale }}
        >
          <LockKeyhole className={styles.keyholeSvg} />
        </motion.div>
      </motion.div>

      <motion.div
        className={styles.shackleWrap}
        data-security-lock-shackle-wrap=""
        data-security-lock-shackle-closed="true"
        style={{ opacity: shackleOp, scaleY: shackleScaleY }}
      >
        <LockShackle className={styles.shackleSvg} />
      </motion.div>
    </motion.div>
  )
}
