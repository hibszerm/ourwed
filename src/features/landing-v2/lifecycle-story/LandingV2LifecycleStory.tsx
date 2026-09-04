import { useEffect, useRef, useState } from 'react'
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
  publishLifecycleExitT,
} from '@/features/landing-v2/lifecycle-story/lifecycleExitClock'
import {
  LIFECYCLE_RANGES,
  easeInOutCubic,
  easeOutCubic,
  ipadExitFromProgress,
  rangeT,
} from '@/features/landing-v2/lifecycle-story/lifecycleStoryProgress'
import { WorkflowExplorer } from '@/features/landing-v2/lifecycle-story/workflow/WorkflowExplorer'
import styles from './LandingV2LifecycleStory.module.css'

const OWNED_EPS = 0.002

/**
 * Landing V2 Lifecycle Story.
 * Scroll: Product exit → headline → link pill → pill morphs into workspace.
 * After settle: click-driven WorkflowExplorer (no scroll tabs / no C2 scenes).
 */
export function LandingV2LifecycleStory() {
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion()
  const [compact, setCompact] = useState(false)
  const progress = useMotionValue(0)
  const navHRef = useRef(68)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)')
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const simple = Boolean(reduced) || compact

  useEffect(() => {
    if (simple) {
      progress.set(1)
      publishLifecycleExitT(1)
      return () => clearLifecycleExitT()
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
    return (1 - i) * 16 - o * 10
  })
  const headlineScale = useTransform([headlineIn, headlineOut], ([inn, out]) => {
    const i = Number(inn)
    const o = Number(out)
    return 0.99 + i * 0.01 - o * 0.04
  })

  /* Soft paper clear only at track end — Features can read through as sticky unpins. */
  const stickyPaperOp = useTransform(progress, (p) => {
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
            <WorkflowExplorer interactive />
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
        <div className={styles.stage}>
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
            <LifecycleTransformSurface progress={progress} />
          </div>
        </div>
      </div>
    </section>
  )
}
