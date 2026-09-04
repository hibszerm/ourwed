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
}

/**
 * Portrait phone — chassis becomes the large security lock body.
 * Shackle + keyhole are permanent overlays (opacity 0 until post-Brief).
 */
export function HeroPhoneFrame({ children, className, lockMorph }: Props) {
  const aspectRatio = useTransform(
    lockMorph.compress,
    (c) => PHONE_ASPECT_RATIO + (LOCK_ASPECT_RATIO - PHONE_ASPECT_RATIO) * Number(c),
  )

  /* Continuous unit mix — no cqw↔px threshold that can thrash near compress≈0. */
  const chassisRadius = useTransform(lockMorph.compress, (c) => {
    const t = Number(c)
    const phoneCqw = (88 / 430) * 100 * (1 - t)
    const lockPx = LOCK_BODY.r * t
    return `calc(${phoneCqw.toFixed(4)}cqw + ${lockPx.toFixed(2)}px)`
  })

  const bezelRadius = useTransform(lockMorph.compress, (c) => {
    const t = Number(c)
    const phoneCqw = (74 / 430) * 100 * (1 - t)
    const lockPx = Math.max(8, LOCK_BODY.r - 6) * t
    return `calc(${phoneCqw.toFixed(4)}cqw + ${lockPx.toFixed(2)}px)`
  })

  const insetPad = useTransform(lockMorph.compress, (c) => {
    const t = Number(c)
    return `${((10 / 430) * 100 * (1 - t)).toFixed(4)}cqw`
  })

  const screenMergeOp = useTransform(lockMorph.screenMerge, (m) =>
    Math.min(1, Math.max(0, Number(m))),
  )
  const shackleScaleY = useTransform(lockMorph.shackle, (t) => 0.22 + Number(t) * 0.78)
  const shackleOp = useTransform(lockMorph.shackle, (t) => Math.min(1, Number(t) * 1.15))
  const keyholeScale = useTransform(lockMorph.keyhole, (t) => 0.82 + Number(t) * 0.18)

  return (
    <motion.div
      className={[styles.deviceRoot, className].filter(Boolean).join(' ')}
      data-testid="lv2-mobile-phone"
      data-mobile-phone=""
      data-phone-lock-morph=""
      data-security-morph-body=""
      style={{ aspectRatio }}
      aria-hidden
    >
      <motion.span
        className={styles.btnSilent}
        data-phone-btn="silent"
        style={{ opacity: lockMorph.chrome }}
      />
      <motion.span
        className={styles.btnVolUp}
        data-phone-btn="vol-up"
        style={{ opacity: lockMorph.chrome }}
      />
      <motion.span
        className={styles.btnVolDown}
        data-phone-btn="vol-down"
        style={{ opacity: lockMorph.chrome }}
      />
      <motion.span
        className={styles.btnPower}
        data-phone-btn="power"
        style={{ opacity: lockMorph.chrome }}
      />

      <motion.div
        className={styles.chassis}
        data-phone-chassis=""
        data-security-lock-chassis=""
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
            style={{ opacity: lockMorph.chrome }}
            aria-hidden
          >
            <span className={styles.islandLens} />
          </motion.div>

          <div className={styles.screen} data-phone-screen="">
            <motion.div className={styles.screenContent} style={{ opacity: lockMorph.brief }}>
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
          data-security-lock-keyhole="true"
          style={{ opacity: lockMorph.keyhole, scale: keyholeScale }}
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
