import type { ReactNode } from 'react'
import { motion, useTransform } from 'framer-motion'
import { mobileStoryProgressMv } from '@/features/landing-v2/mobile-story/mobileStoryClock'
import {
  featuresBlurPxAt,
  featuresOpacityAt,
  featuresScaleAt,
  featuresYAt,
} from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import styles from './FeaturesExitShell.module.css'

type Props = {
  children: ReactNode
}

/**
 * External exit wrapper for the approved Features Grid composition.
 * Transparent layout owner — motion/filter applies only to the inner content layer.
 */
export function FeaturesExitShell({ children }: Props) {
  const opacity = useTransform(mobileStoryProgressMv, (p) => featuresOpacityAt(p))
  const y = useTransform(mobileStoryProgressMv, (p) => featuresYAt(p))
  const scale = useTransform(mobileStoryProgressMv, (p) => featuresScaleAt(p))
  const blur = useTransform(mobileStoryProgressMv, (p) => {
    const b = featuresBlurPxAt(p)
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  return (
    <div className={styles.shell} data-lv2-features-exit="">
      <motion.div
        className={styles.motionLayer}
        style={{ opacity, y, scale, filter: blur }}
      >
        {children}
      </motion.div>
    </div>
  )
}
