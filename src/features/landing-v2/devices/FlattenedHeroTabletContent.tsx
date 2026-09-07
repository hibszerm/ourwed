import { useEffect } from 'react'
import { motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { LANDING_DEVICE_ASSETS } from '@/features/landing-v2/devices/landingDeviceAssets'
import styles from './FlattenedHeroTabletContent.module.css'

type Props = {
  /** 0 = light, 1 = graphite/dark — same range as live themeProgress. */
  themeProgress?: MotionValue<number>
  /** Static fallback when theater is reduced-motion. */
  themeStatic?: number
}

/**
 * Compact tablet application content — two compositor layers only.
 * Live HeroModernDashboard must NOT mount when this is used.
 */
export function FlattenedHeroTabletContent({
  themeProgress,
  themeStatic = 0,
}: Props) {
  const fallback = useMotionValue(themeStatic)
  const progress = themeProgress ?? fallback

  useEffect(() => {
    fallback.set(themeStatic)
  }, [fallback, themeStatic])

  const lightOp = useTransform(progress, (t) => 1 - Math.min(1, Math.max(0, Number(t))))
  const darkOp = useTransform(progress, (t) => Math.min(1, Math.max(0, Number(t))))

  useEffect(() => {
    const a = new Image()
    const b = new Image()
    a.src = LANDING_DEVICE_ASSETS.heroTabletLight
    b.src = LANDING_DEVICE_ASSETS.heroTabletDark
  }, [])

  return (
    <div
      className={styles.root}
      data-flattened-hero-tablet=""
      data-testid="lv2-flattened-hero-tablet"
      role="img"
      aria-label="OurWed — pulpit studia (podgląd)"
    >
      <motion.img
        className={styles.layer}
        src={LANDING_DEVICE_ASSETS.heroTabletLight}
        alt=""
        draggable={false}
        decoding="async"
        style={{ opacity: lightOp }}
        data-flattened-layer="light"
      />
      <motion.img
        className={styles.layer}
        src={LANDING_DEVICE_ASSETS.heroTabletDark}
        alt=""
        draggable={false}
        decoding="async"
        style={{ opacity: darkOp }}
        data-flattened-layer="dark"
      />
    </div>
  )
}
