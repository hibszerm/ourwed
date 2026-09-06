import { useEffect, useRef } from 'react'
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'framer-motion'
import { karolinaJan } from '@/features/landing-v2/narrative/karolinaJan'
import { LifecycleLinkObject } from '@/features/landing-v2/lifecycle-story/LifecycleLinkObject'
import { LifecycleTransformSurface } from '@/features/landing-v2/lifecycle-story/LifecycleTransformSurface'
import {
  clearLifecycleExitT,
  clearLifecycleProgressT,
  publishLifecycleExitT,
  publishLifecycleProgressT,
} from '@/features/landing-v2/lifecycle-story/lifecycleExitClock'
import {
  LIFECYCLE_RANGES,
  easeInOutCubic,
  easeOutCubic,
  ipadExitFromProgress,
  rangeT,
} from '@/features/landing-v2/lifecycle-story/lifecycleStoryProgress'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import { WorkflowExplorer } from '@/features/landing-v2/lifecycle-story/workflow/WorkflowExplorer'
import styles from './LandingV2LifecycleStory.module.css'

const OWNED_EPS = 0.002

/**
 * Landing V2 Lifecycle Story.
 * Scroll: Product exit → headline → link pill → pill morphs into workspace.
 * After settle: click-driven WorkflowExplorer (no scroll tabs / no C2 scenes).
 *
 * Compact viewport runs the same theater; only prefers-reduced-motion is static.
 */
export function LandingV2LifecycleStory() {
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const isCompactViewport = useLandingCompactViewport()
  const progress = useMotionValue(0)
  const navHRef = useRef(68)

  /* Theater runs on compact; only accessibility reduces to static. */
  const simple = Boolean(reduced)

  useEffect(() => {
    if (simple) {
      progress.set(1)
      publishLifecycleProgressT(1)
      /*
       * PRM static — do NOT force Product iPad exit. Product compact theater
       * still needs the settled tablet until the user leaves that chapter.
       */
      publishLifecycleExitT(0)
      return () => {
        clearLifecycleExitT()
        clearLifecycleProgressT()
      }
    }

    const el = trackRef.current
    if (!el) return

    let raf = 0

    const measure = () => {
      if (!navHRef.current || navHRef.current === 68) {
        navHRef.current =
          parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h')) || 68
      }
      const navH = navHRef.current
      const rect = el.getBoundingClientRect()
      const travel = Math.max(1, el.offsetHeight - (window.innerHeight - navH))
      const raw =
        rect.top > navH + 0.5
          ? 0
          : Math.min(1, Math.max(0, (navH - rect.top) / travel))
      progress.set(raw)
      publishLifecycleProgressT(raw)
      publishLifecycleExitT(ipadExitFromProgress(raw))
      const sticky = stickyRef.current
      if (sticky) {
        sticky.setAttribute('data-lifecycle-progress', raw.toFixed(4))
      }
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    const onResize = () => {
      navHRef.current =
        parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h')) || 68
      onScroll()
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      clearLifecycleExitT()
      clearLifecycleProgressT()
    }
  }, [simple, progress])

  useMotionValueEvent(progress, 'change', (p) => {
    const sticky = stickyRef.current
    if (!sticky) return
    sticky.setAttribute('data-lifecycle-owned', p > OWNED_EPS ? 'true' : 'false')
  })

  const r = LIFECYCLE_RANGES

  const headlineIn = useTransform(progress, (p) =>
    easeOutCubic(rangeT(p, r.headlineIn.start, r.headlineIn.end)),
  )
  const headlineOut = useTransform(progress, (p) =>
    easeInOutCubic(rangeT(p, r.headlineOut.start, r.headlineOut.end)),
  )
  const headlineOpacity = useTransform([headlineIn, headlineOut], ([inn, out]) => {
    const i = Number(inn)
    const o = Number(out)
    return i * (1 - o)
  })
  const headlineY = useTransform([headlineIn, headlineOut], ([inn, out]) => {
    const i = Number(inn)
    const o = Number(out)
    /* Compact: slightly less travel so headline stays optically centered. */
    const enter = isCompactViewport ? 12 : 16
    const exit = isCompactViewport ? 8 : 10
    return (1 - i) * enter - o * exit
  })
  const headlineScale = useTransform([headlineIn, headlineOut], ([inn, out]) => {
    const i = Number(inn)
    const o = Number(out)
    return 0.99 + i * 0.01 - o * 0.04
  })

  /**
   * Compact-only handoff — stretched overlap with Features intro.
   * Stage begins exiting ~0.76 and finishes ~0.98 so workspace and heading coexist.
   * Desktop stage stays fully opaque.
   */
  const compactHandoffRef = useRef(isCompactViewport)
  compactHandoffRef.current = isCompactViewport
  const stickyStageOp = useTransform(progress, (p) => {
    if (!compactHandoffRef.current) return 1
    if (p < 0.76) return 1
    return 1 - easeInOutCubic((p - 0.76) / 0.22)
  })
  const stickyStageY = useTransform(progress, (p) => {
    if (!compactHandoffRef.current) return 0
    if (p < 0.76) return 0
    return -14 * easeInOutCubic((p - 0.76) / 0.22)
  })
  /* Compact paper clears with the stage (slightly earlier lead-in). */
  const stickyPaperOp = useTransform(progress, (p) => {
    if (compactHandoffRef.current) {
      if (p < 0.74) return 1
      return 1 - easeInOutCubic((p - 0.74) / 0.22)
    }
    if (p < 0.92) return 1
    return 1 - easeInOutCubic((p - 0.92) / 0.08)
  })

  const n = karolinaJan

  if (simple) {
    return (
      <section
        className={styles.static}
        data-testid="lv2-lifecycle-story"
        data-lifecycle-theater="static"
        data-lifecycle-compact={isCompactViewport ? 'true' : 'false'}
        aria-labelledby="lv2-lifecycle-heading"
      >
        <h2 id="lv2-lifecycle-heading" className={styles.headlineStatic}>
          {n.copy.headlineLine1}
          <br />
          {n.copy.headlineLine2}
        </h2>
        <div className={styles.staticBody}>
          <div className={styles.staticLink}>
            <LifecycleLinkObject />
          </div>
          <div className={styles.staticWorkspace} data-lifecycle-workspace-static="">
            <WorkflowExplorer interactive compact={isCompactViewport} />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={trackRef}
      className={styles.track}
      data-testid="lv2-lifecycle-story"
      data-lifecycle-theater="scroll"
      data-lifecycle-morph="pill-to-workspace"
      data-lifecycle-compact={isCompactViewport ? 'true' : 'false'}
      aria-labelledby="lv2-lifecycle-heading"
    >
      <div
        ref={stickyRef}
        className={styles.sticky}
        data-lifecycle-sticky=""
        data-lifecycle-owned="false"
      >
        <motion.div
          className={styles.stickyPaper}
          data-lifecycle-sticky-paper=""
          style={{ opacity: stickyPaperOp }}
          aria-hidden
        />
        <motion.div
          className={styles.stage}
          data-lifecycle-stage=""
          style={{ opacity: stickyStageOp, y: stickyStageY }}
        >
          <motion.div
            className={styles.headline}
            data-lifecycle-headline=""
            style={{
              opacity: headlineOpacity,
              y: headlineY,
              scale: headlineScale,
            }}
          >
            <h2 id="lv2-lifecycle-heading">
              {n.copy.headlineLine1}
              <br />
              {n.copy.headlineLine2}
            </h2>
          </motion.div>

          <div className={styles.theater} data-lifecycle-theater-slot="">
            <LifecycleTransformSurface
              progress={progress}
              compact={isCompactViewport}
            />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
