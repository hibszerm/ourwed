import { useEffect, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion, useTransform } from 'framer-motion'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
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
 *
 * Compact / reduced-motion: Mobile Story publishes progress=1 in its static path,
 * which would otherwise force featuresOpacityAt(1)=0 and hide the entire Features
 * section. Bypass exit motion so Features remain a normal readable scroll chapter.
 */
export function FeaturesExitShell({ children }: Props) {
  const isCompactViewport = useLandingCompactViewport()
  const reduced = useReducedMotion()
  const bypassExitRef = useRef(false)
  bypassExitRef.current = Boolean(isCompactViewport) || Boolean(reduced)

  const opacity = useTransform(mobileStoryProgressMv, (p) =>
    bypassExitRef.current ? 1 : featuresOpacityAt(p),
  )
  const y = useTransform(mobileStoryProgressMv, (p) =>
    bypassExitRef.current ? 0 : featuresYAt(p),
  )
  const scale = useTransform(mobileStoryProgressMv, (p) =>
    bypassExitRef.current ? 1 : featuresScaleAt(p),
  )
  const blur = useTransform(mobileStoryProgressMv, (p) => {
    if (bypassExitRef.current) return 'blur(0px)'
    const b = featuresBlurPxAt(p)
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  /* Retrigger transforms when bypass flips (progress may already be parked at 1). */
  useEffect(() => {
    mobileStoryProgressMv.set(mobileStoryProgressMv.get())
  }, [isCompactViewport, reduced])

  return (
    <div
      className={styles.shell}
      data-lv2-features-exit=""
      data-features-exit-bypass={bypassExitRef.current ? 'true' : 'false'}
    >
      <motion.div
        className={styles.motionLayer}
        style={{ opacity, y, scale, filter: blur }}
      >
        {children}
      </motion.div>
    </div>
  )
}
