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
 * section. Bypass exit motion entirely (no filter/scale MotionValues) so Safari
 * cannot keep a filter compositing layer over the vertical card stack.
 */
export function FeaturesExitShell({ children }: Props) {
  const isCompactViewport = useLandingCompactViewport()
  const reduced = useReducedMotion()
  const bypassExit = Boolean(isCompactViewport) || Boolean(reduced)
  const bypassExitRef = useRef(bypassExit)
  bypassExitRef.current = bypassExit

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

  if (bypassExit) {
    return (
      <div
        className={styles.shell}
        data-lv2-features-exit=""
        data-features-exit-bypass="true"
      >
        {/*
          Plain layer — no filter/transform MotionValues.
          Even filter:blur(0px) + will-change:filter can soften the stack in Safari.
        */}
        <div className={styles.motionLayerStatic} data-features-exit-layer="static">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      className={styles.shell}
      data-lv2-features-exit=""
      data-features-exit-bypass="false"
    >
      <motion.div
        className={styles.motionLayer}
        data-features-exit-layer="motion"
        style={{ opacity, y, scale, filter: blur }}
      >
        {children}
      </motion.div>
    </div>
  )
}
