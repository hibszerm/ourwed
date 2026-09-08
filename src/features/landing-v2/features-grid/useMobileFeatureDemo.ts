import { useEffect, useRef, useState, type RefObject } from 'react'
import { landingLayoutViewportSize } from '@/features/landing-v2/motion/landingStableViewport'
import {
  featureDemoDataAttr,
  nextMobileFeatureDemoPhase,
  type MobileFeatureDemoPhase,
} from '@/features/landing-v2/features-grid/mobileFeatureDemoGeometry'

type Options = {
  reducedMotion?: boolean
}

/**
 * Replayable mobile feature demo controller.
 *
 * Two coarse IntersectionObservers on a 1px center sentinel:
 * - activation band ≈ 72–78% of stable viewport (rootMargin)
 * - presence band ≈ 22–110% for hysteresis reset
 *
 * One getBoundingClientRect per callback. No scroll listeners, rAF loops,
 * or Framer scroll progress.
 */
export function useMobileFeatureDemo(
  cardRef: RefObject<HTMLElement | null>,
  { reducedMotion = false }: Options = {},
): {
  phase: MobileFeatureDemoPhase
  demoAttr: 'rest' | 'done'
} {
  const [phase, setPhase] = useState<MobileFeatureDemoPhase>(
    reducedMotion ? 'settled' : 'rest',
  )
  const phaseRef = useRef<MobileFeatureDemoPhase>(phase)
  phaseRef.current = phase

  useEffect(() => {
    if (reducedMotion) {
      phaseRef.current = 'settled'
      setPhase('settled')
      return
    }

    const el = cardRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const sentinel =
      (el.querySelector('[data-feature-demo-anchor]') as HTMLElement | null) ??
      el

    const evaluate = () => {
      const rect = sentinel.getBoundingClientRect()
      const centerY = rect.top + rect.height / 2
      const { h } = landingLayoutViewportSize()
      const next = nextMobileFeatureDemoPhase(phaseRef.current, centerY, h)
      if (next === phaseRef.current) return

      const applied: MobileFeatureDemoPhase =
        next === 'active' ? 'settled' : next
      if (applied === phaseRef.current) return
      phaseRef.current = applied
      setPhase(applied)
    }

    /*
     * Activation band: shrink root to ~72%–78% of viewport.
     * top -72%, bottom -22% → remaining 6% band.
     */
    const activateIo = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) evaluate()
      },
      {
        root: null,
        rootMargin: '-72% 0px -22% 0px',
        threshold: 0,
      },
    )

    /*
     * Presence band: ~22%–110%. Leaving → evaluate (reset if far).
     * top -22%, bottom +10% → root from 22% to 110% of viewport height.
     */
    const presenceIo = new IntersectionObserver(
      () => {
        evaluate()
      },
      {
        root: null,
        rootMargin: '-22% 0px 10% 0px',
        threshold: 0,
      },
    )

    activateIo.observe(sentinel)
    presenceIo.observe(sentinel)
    evaluate()
    return () => {
      activateIo.disconnect()
      presenceIo.disconnect()
    }
  }, [cardRef, reducedMotion])

  return {
    phase,
    demoAttr: featureDemoDataAttr(phase),
  }
}
