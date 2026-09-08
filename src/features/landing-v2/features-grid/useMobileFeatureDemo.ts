import { useEffect, useRef, useState, type RefObject } from 'react'
import { landingLayoutViewportSize } from '@/features/landing-v2/motion/landingStableViewport'
import {
  createFeatureDemoSample,
  featureDemoCenterRatio,
  featureDemoDataAttr,
  shouldIgnoreFeatureDemoSample,
  stepFeatureDemo,
  type FeatureDemoSample,
  type MobileFeatureDemoPhase,
} from '@/features/landing-v2/features-grid/mobileFeatureDemoGeometry'

type Options = {
  reducedMotion?: boolean
}

/**
 * Coarse tracking corridor — NOT the UX trigger.
 * top -40%, bottom +5% → effective root ≈ 40%–105% of viewport.
 * Supplies IO callbacks before/through/after the 75% reading line.
 */
export const FEATURE_DEMO_COARSE_ROOT_MARGIN = '-40% 0px 5% 0px'

/** Enough thresholds for sparse Safari momentum samples. */
const COARSE_THRESHOLDS = [
  0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65,
  0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1,
] as const

/**
 * Replayable mobile feature demo — Iteration 3E.2.
 *
 * IntersectionObserver = coarse arming only.
 * Trigger = reading-line CROSSING (prev→curr), direction-aware.
 * No scroll listener / rAF / Framer useScroll.
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

  const sampleRef = useRef<FeatureDemoSample>(
    createFeatureDemoSample(reducedMotion ? 'settled' : 'rest'),
  )
  const prevAbsRef = useRef<{ y: number; h: number } | null>(null)

  useEffect(() => {
    if (reducedMotion) {
      sampleRef.current = createFeatureDemoSample('settled')
      phaseRef.current = 'settled'
      setPhase('settled')
      return
    }

    const el = cardRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const sentinel =
      (el.querySelector('[data-feature-demo-anchor]') as HTMLElement | null) ??
      el

    const ingest = (anchorY: number, viewportH: number) => {
      const prevAbs = prevAbsRef.current
      if (
        shouldIgnoreFeatureDemoSample({
          prevY: prevAbs?.y ?? null,
          currY: anchorY,
          prevH: prevAbs?.h ?? null,
          currH: viewportH,
        })
      ) {
        prevAbsRef.current = { y: anchorY, h: viewportH }
        return
      }

      const currRatio = featureDemoCenterRatio(anchorY, viewportH)
      const next = stepFeatureDemo(sampleRef.current, currRatio)
      sampleRef.current = {
        phase: next.phase,
        prevRatio: next.prevRatio,
        playCount: next.playCount,
      }
      prevAbsRef.current = { y: anchorY, h: viewportH }

      if (next.phase !== phaseRef.current) {
        phaseRef.current = next.phase
        setPhase(next.phase)
      }
    }

    const onEntries = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const root = entry.rootBounds
        const rect = entry.boundingClientRect
        const layout = landingLayoutViewportSize()
        /*
         * Prefer IO rootBounds height when present; fall back to stable layout
         * viewport. Never dynamic browser-chrome height for the reading line.
         */
        const vh = root && root.height > 0 ? root.height : layout.h
        const top = root ? root.top : 0
        const centerY = rect.top + rect.height / 2 - top
        ingest(centerY, vh)
      }
    }

    const io = new IntersectionObserver(onEntries, {
      root: null,
      rootMargin: FEATURE_DEMO_COARSE_ROOT_MARGIN,
      threshold: [...COARSE_THRESHOLDS],
    })
    io.observe(sentinel)

    /* Seed prevRatio without playing. */
    {
      const rect = sentinel.getBoundingClientRect()
      const { h } = landingLayoutViewportSize()
      const y = rect.top + rect.height / 2
      sampleRef.current = {
        ...sampleRef.current,
        prevRatio: featureDemoCenterRatio(y, h),
      }
      prevAbsRef.current = { y, h }
    }

    return () => io.disconnect()
  }, [cardRef, reducedMotion])

  return {
    phase,
    demoAttr: featureDemoDataAttr(phase),
  }
}
