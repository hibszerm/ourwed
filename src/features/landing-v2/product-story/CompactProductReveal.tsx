import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMotionValueEvent, useReducedMotion } from 'framer-motion'
import { HeroTabletFrame } from '@/features/landing-v2/hero/HeroTabletFrame'
import { measureCanonicalDeviceFit } from '@/features/landing-v2/hero/landingTabletFit'
import { FlattenedProductAutoplay } from '@/features/landing-v2/devices/FlattenedProductAutoplay'
import { useTheaterScrollGate } from '@/features/landing-v2/motion/useTheaterScrollGate'
import {
  compactProductExitPhase,
  compactProductExitTravelPx,
  compactProductNativeExitScrollPx,
} from '@/features/landing-v2/product-story/compactProductExit'
import {
  productTheaterOwned,
  stickyTrackProgress,
} from '@/features/landing-v2/product-story/productStoryProgress'
import { scene07HandoffMv } from '@/features/landing-v2/product-story/scene07HandoffClock'
import styles from './CompactProductReveal.module.css'

/**
 * Compact Product Story — Iteration 3A + 3C.2 + 3C.3.
 *
 * Visual stacking: transparent sticky under black narrative (geometry only).
 * No JS visibility/z-index ownership latch — fast flicks stay deterministic.
 * Exit: native sticky unpin 1:1. Presentation tablet: pointer-events none.
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
  const [autoplayActive, setAutoplayActive] = useState(false)
  const [sectionNear, setSectionNear] = useState(true)
  const { activeRef, onBecameActiveRef } = useTheaterScrollGate(
    trackRef,
    !reduced,
  )

  /* Coarse resource gate only — never authoritative for black/Product paint. */
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

  /* Autoplay only — paint/stacking does not subscribe to handoff ownership. */
  useMotionValueEvent(scene07HandoffMv, 'change', (handoffT) => {
    if (reduced) return
    const owned = productTheaterOwned(handoffT)
    const next = owned && handoffT >= 0.28 && sectionNear
    setAutoplayActive((prev) => (prev === next ? prev : next))
    stickyRef.current?.setAttribute(
      'data-ps-autoplay-gate',
      next ? 'on' : 'off',
    )
  })

  useEffect(() => {
    if (reduced) {
      setAutoplayActive(false)
      return
    }
    const handoffT = scene07HandoffMv.get()
    const owned = productTheaterOwned(handoffT)
    const next = owned && handoffT >= 0.28 && sectionNear
    setAutoplayActive((prev) => (prev === next ? prev : next))
  }, [reduced, sectionNear])

  useEffect(() => {
    if (reduced) {
      scene07HandoffMv.set(1)
      setAutoplayActive(false)
      return
    }

    let raf = 0
    const measure = () => {
      const el = trackRef.current
      const sticky = stickyRef.current
      if (!el || !sticky) return
      const navH =
        parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h')) || 68
      stickyTrackProgress(el, navH, window.innerHeight)

      /*
       * Exit phase from stickyTop geometry only (no eased Lifecycle clock).
       * Does not toggle entrance visibility — black covers via z-index.
       */
      const stickyH =
        sticky.clientHeight || Math.max(320, window.innerHeight - navH)
      const exitTravel = compactProductExitTravelPx(stickyH)
      const stickyTop = sticky.getBoundingClientRect().top
      const scrollAway = compactProductNativeExitScrollPx(stickyTop, navH)
      const phase = compactProductExitPhase(stickyTop, navH, exitTravel)

      sticky.setAttribute('data-ps-lifecycle-exit', phase)
      sticky.setAttribute('data-ps-exit-scroll', String(Math.round(scrollAway)))
      sticky.setAttribute('data-ps-exit-y', String(Math.round(-scrollAway)))
    }

    const onScroll = () => {
      if (!activeRef.current) {
        const sticky = stickyRef.current
        if (!sticky) return
        /* Still update exit attrs when near/past exit even if gate inactive. */
        const top = sticky.getBoundingClientRect().top
        const navH =
          parseFloat(
            getComputedStyle(trackRef.current!).getPropertyValue('--lv2-nav-h'),
          ) || 68
        if (top > navH + 2 && top > window.innerHeight) return
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
  }, [reduced, activeRef, onBecameActiveRef])

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
      data-product-exit="native-sticky"
      data-product-handoff="geometry"
      data-product-pointer="none"
      aria-labelledby="lv2-product-heading"
    >
      <h2 id="lv2-product-heading" className={styles.visuallyHidden}>
        Jedno zlecenie w OurWed
      </h2>

      <div
        ref={stickyRef}
        className={styles.sticky}
        data-product-sticky-stage=""
        data-ps-compact="true"
        data-ps-camera-travel="false"
        data-ps-exit-scale="false"
        data-ps-paint="geometry"
        data-ps-lifecycle-exit="idle"
      >
        <div className={styles.stage} data-ps-visual-stage="" data-ps-stage-bg="transparent">
          <div
            className={styles.deviceExit}
            data-ps-device-exit=""
            data-ps-exit-native="true"
            data-ps-device-bg="transparent"
          >
            <div
              className={styles.deviceFitSlot}
              data-ps-device-fit="scale"
              data-ps-fit-bg="transparent"
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
                    data-ps-beige-scope="screen"
                  >
                    <FlattenedProductAutoplay
                      active={autoplayActive}
                      reducedMotion={false}
                    />
                  </div>
                </HeroTabletFrame>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
