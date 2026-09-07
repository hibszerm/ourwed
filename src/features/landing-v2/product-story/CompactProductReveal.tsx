import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'framer-motion'
import { HeroTabletFrame } from '@/features/landing-v2/hero/HeroTabletFrame'
import { measureCanonicalDeviceFit } from '@/features/landing-v2/hero/landingTabletFit'
import { FlattenedProductAutoplay } from '@/features/landing-v2/devices/FlattenedProductAutoplay'
import { useTheaterScrollGate } from '@/features/landing-v2/motion/useTheaterScrollGate'
import { lifecycleExitMv } from '@/features/landing-v2/lifecycle-story/lifecycleExitClock'
import {
  productTheaterOwned,
  stickyTrackProgress,
} from '@/features/landing-v2/product-story/productStoryProgress'
import { scene07HandoffMv } from '@/features/landing-v2/product-story/scene07HandoffClock'
import styles from './CompactProductReveal.module.css'

/**
 * Compact Product Story — Iteration 3A.
 *
 * Scene 07 black card (Problem Story) translates upward and reveals a STABLE
 * tablet. Tablet content autoplays flattened tabs — not scroll-driven.
 * No reverse-Hero camera scale.
 */
export function CompactProductReveal() {
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const deviceFitRef = useRef<HTMLDivElement | null>(null)
  const reduced = Boolean(useReducedMotion())
  const [deviceFitScale, setDeviceFitScale] = useState(1)
  const [deviceFitSlot, setDeviceFitSlot] = useState<{
    w: number
    h: number
  } | null>(null)
  const [theaterOwned, setTheaterOwned] = useState(false)
  const [autoplayActive, setAutoplayActive] = useState(false)
  const [sectionNear, setSectionNear] = useState(true)
  const revealProgress = useMotionValue(0)
  const { activeRef, onBecameActiveRef } = useTheaterScrollGate(
    trackRef,
    !reduced,
  )

  useEffect(() => {
    if (reduced) return
    const el = trackRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        const near = Boolean(entry?.isIntersecting)
        setSectionNear((prev) => (prev === near ? prev : near))
      },
      { root: null, rootMargin: '50% 0px 50% 0px', threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  useLayoutEffect(() => {
    const sticky = stickyRef.current
    const fitEl = deviceFitRef.current
    if (!sticky || !fitEl) return

    const measure = () => {
      const next = measureCanonicalDeviceFit({
        sticky,
        fit: fitEl,
        padX: 18,
        padY: 20,
        cssVar: '--ps-device-fit-scale',
      })
      if (!next) return
      setDeviceFitScale(next.scale)
      setDeviceFitSlot({ w: next.slotW, h: next.slotH })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(sticky)
    return () => ro.disconnect()
  }, [])

  useMotionValueEvent(scene07HandoffMv, 'change', (handoffT) => {
    const owned = productTheaterOwned(handoffT)
    setTheaterOwned((prev) => (prev === owned ? prev : owned))
    const sticky = stickyRef.current
    if (sticky) {
      sticky.setAttribute('data-ps-theater-owned', owned ? 'true' : 'false')
    }
  })

  /* Autoplay: independent of scroll progress; gated by reveal + near-viewport. */
  useEffect(() => {
    if (reduced) {
      setAutoplayActive(false)
      return
    }
    const handoffT = scene07HandoffMv.get()
    const owned = productTheaterOwned(handoffT)
    const next = owned && handoffT >= 0.28 && sectionNear
    setAutoplayActive((prev) => (prev === next ? prev : next))

    const unsub = scene07HandoffMv.on('change', (t) => {
      const o = productTheaterOwned(t)
      const n = o && t >= 0.28 && sectionNear
      setAutoplayActive((prev) => (prev === n ? prev : n))
    })
    return unsub
  }, [reduced, sectionNear])

  useEffect(() => {
    if (reduced) {
      scene07HandoffMv.set(1)
      setTheaterOwned(true)
      setAutoplayActive(false)
      return
    }

    let raf = 0
    const measure = () => {
      const el = trackRef.current
      if (!el) return
      const navH =
        parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h')) || 68
      const p = stickyTrackProgress(el, navH, window.innerHeight)
      revealProgress.set(p)

      const handoffT = scene07HandoffMv.get()
      const owned = productTheaterOwned(handoffT)
      /* Local sticky progress only gates breath/exit cues — not tablet camera. */
      stickyRef.current?.setAttribute(
        'data-ps-reveal',
        p > 0.02 ? 'open' : 'closed',
      )

      if (!activeRef.current && !owned) return
    }

    const onScroll = () => {
      if (!activeRef.current && !productTheaterOwned(scene07HandoffMv.get())) {
        return
      }
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    onBecameActiveRef.current = onScroll
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      onBecameActiveRef.current = null
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [reduced, activeRef, onBecameActiveRef, revealProgress])

  /* Lifecycle exit — same post-product channel; no entrance scale. */
  const lifecycleExitY = useTransform(
    [lifecycleExitMv, scene07HandoffMv],
    (values: number[]) => {
      const exitT = values[0] ?? 0
      const handoffT = values[1] ?? 0
      if (handoffT < 0.995) return 0
      const e = Math.min(1, Math.max(0, exitT))
      const vh = typeof window !== 'undefined' ? window.innerHeight : 900
      return e * vh * -1.1
    },
  )
  const lifecycleExitOpacity = useTransform(
    [lifecycleExitMv, scene07HandoffMv],
    (values: number[]) => {
      const exitT = values[0] ?? 0
      const handoffT = values[1] ?? 0
      if (handoffT < 0.995) return 1
      const e = Math.min(1, Math.max(0, exitT))
      if (e < 0.85) return 1
      return 1 - ((e - 0.85) / 0.15) * 0.04
    },
  )

  useMotionValueEvent(lifecycleExitMv, 'change', (exitT) => {
    const sticky = stickyRef.current
    if (!sticky) return
    if (scene07HandoffMv.get() < 0.995) {
      sticky.setAttribute('data-ps-lifecycle-exit', 'idle')
      return
    }
    const active = exitT > 0.001
    const done = exitT >= 0.995
    sticky.setAttribute(
      'data-ps-lifecycle-exit',
      done ? 'done' : active ? 'active' : 'idle',
    )
  })

  if (reduced) {
    return (
      <section
        className={styles.track}
        data-testid="lv2-product-story"
        data-product-theater="static"
        data-product-compact-reveal="true"
        aria-labelledby="lv2-product-heading"
      >
        <h2 id="lv2-product-heading" className={styles.visuallyHidden}>
          Jedno zlecenie w OurWed
        </h2>
        <div className={styles.staticStack}>
          <HeroTabletFrame canonical hardwareProgress={1} blackout={0}>
            <FlattenedProductAutoplay active={false} reducedMotion />
          </HeroTabletFrame>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={trackRef}
      className={styles.track}
      data-testid="lv2-product-story"
      data-product-theater="compact-reveal"
      data-product-compact-reveal="true"
      aria-labelledby="lv2-product-heading"
    >
      <h2 id="lv2-product-heading" className={styles.visuallyHidden}>
        Jedno zlecenie w OurWed
      </h2>

      <div
        ref={stickyRef}
        className={styles.sticky}
        data-product-sticky-stage=""
        data-ps-theater-owned={theaterOwned ? 'true' : 'false'}
        data-ps-compact="true"
        data-ps-camera-travel="false"
        data-ps-lifecycle-exit="idle"
      >
        <div className={styles.stage} data-ps-visual-stage="">
          <motion.div
            className={styles.deviceExit}
            data-ps-device-exit=""
            style={{ y: lifecycleExitY, opacity: lifecycleExitOpacity }}
          >
            <div
              className={styles.deviceFitSlot}
              data-ps-device-fit="scale"
              style={
                deviceFitSlot
                  ? { width: deviceFitSlot.w, height: deviceFitSlot.h }
                  : undefined
              }
            >
              <div
                ref={deviceFitRef}
                className={styles.deviceFit}
                style={{
                  ['--ps-device-fit-scale' as string]: deviceFitScale,
                }}
              >
                <HeroTabletFrame canonical fitLock hardwareProgress={1} blackout={0}>
                  <div
                    className={styles.screenClip}
                    data-ps-workspace-clip=""
                    data-ps-workspace-dormant="false"
                  >
                    <FlattenedProductAutoplay
                      active={autoplayActive}
                      reducedMotion={false}
                    />
                  </div>
                </HeroTabletFrame>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
