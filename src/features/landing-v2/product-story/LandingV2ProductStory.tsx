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
import { CompactProductReveal } from '@/features/landing-v2/product-story/CompactProductReveal'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import { useTheaterScrollGate } from '@/features/landing-v2/motion/useTheaterScrollGate'
import { lifecycleExitMv } from '@/features/landing-v2/lifecycle-story/lifecycleExitClock'
import {
  PRODUCT_SCREEN_REVEAL,
  PRODUCT_STORY_COVER_SCALE_FALLBACK,
  computeProductCoverScale,
  deviceScaleFromHandoff,
  productTheaterOwned,
  productVisualActive,
  readProductTabletDiagMode,
  screenBlackoutFromHandoff,
  screenRevealFromHandoff,
  stagePaperFromHandoff,
  stickyTrackProgress,
  tabFromProgress,
  tabProgressFromMaster,
  workspaceDormantFromHandoff,
  type ProductStoryTabId,
  type ProductTabletDiagMode,
} from '@/features/landing-v2/product-story/productStoryProgress'
import { scene07HandoffMv } from '@/features/landing-v2/product-story/scene07HandoffClock'
import { ProductStoryWorkspace } from '@/features/landing-v2/product-story/ProductStoryWorkspace'
import styles from './LandingV2ProductStory.module.css'

/**
 * Landing V2 Product Story — reverse-Hero camera pull-back (desktop).
 * Compact viewports use CompactProductReveal (Iteration 3A).
 */
export function LandingV2ProductStory() {
  const isCompactViewport = useLandingCompactViewport()
  const reduced = useReducedMotion()

  if (isCompactViewport) {
    return <CompactProductReveal />
  }

  return <LandingV2ProductStoryDesktop reduced={Boolean(reduced)} />
}

function LandingV2ProductStoryDesktop({ reduced }: { reduced: boolean }) {
  const isCompactViewport = false
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const cameraRef = useRef<HTMLDivElement | null>(null)
  const deviceFitRef = useRef<HTMLDivElement | null>(null)
  const [activeTab, setActiveTab] = useState<ProductStoryTabId>('overview')
  const [deviceFitScale, setDeviceFitScale] = useState(1)
  const [deviceFitSlot, setDeviceFitSlot] = useState<{ w: number; h: number } | null>(
    null,
  )
  /* Diagnostic mode — URL only, read once. Production default: full. */
  const [tabletDiag] = useState<ProductTabletDiagMode>(() =>
    readProductTabletDiagMode(),
  )
  const progress = useMotionValue(0)
  const coverFallback = PRODUCT_STORY_COVER_SCALE_FALLBACK
  const coverScaleMv = useMotionValue(coverFallback)

  /* Theater runs on compact; only accessibility reduces to static. */
  const simple = Boolean(reduced)
  const { activeRef, onBecameActiveRef } = useTheaterScrollGate(trackRef, !simple)

  useEffect(() => {
    if (simple) return
    coverScaleMv.set(coverFallback)
  }, [simple, coverFallback, coverScaleMv])

  /*
   * Handoff ownership + workspace dormancy — DOM attributes only
   * (no per-frame React state). Visual transforms use MotionValues below.
   */
  useMotionValueEvent(scene07HandoffMv, 'change', (handoffT) => {
    if (simple) return

    const owned = productTheaterOwned(handoffT)
    const active = productVisualActive(handoffT)
    const sticky = stickyRef.current
    const visual = sticky?.querySelector('[data-ps-visual-stage]') as HTMLElement | null
    const clip = cameraRef.current?.querySelector(
      '[data-ps-workspace-clip]',
    ) as HTMLElement | null

    if (sticky) {
      const next = owned ? 'true' : 'false'
      if (sticky.getAttribute('data-ps-theater-owned') !== next) {
        sticky.setAttribute('data-ps-theater-owned', next)
      }
      /* Compact entrance: cheaper shell paint while camera is still traveling. */
      const travel = handoffT < 0.98 ? 'true' : 'false'
      if (sticky.getAttribute('data-ps-camera-travel') !== travel) {
        sticky.setAttribute('data-ps-camera-travel', travel)
      }
    }
    if (visual) {
      const next = active ? 'true' : 'false'
      if (visual.getAttribute('data-ps-visual-active') !== next) {
        visual.setAttribute('data-ps-visual-active', next)
      }
    }
    if (clip) {
      /*
       * Force-dormant for black/flat diagnostics; otherwise discrete reveal gate.
       * Blackout opacity alone does not stop WebKit from compositing children.
       */
      const forceDormant = tabletDiag === 'black' || tabletDiag === 'flat'
      const dormant = forceDormant || workspaceDormantFromHandoff(handoffT)
      const next = dormant ? 'true' : 'false'
      if (clip.getAttribute('data-ps-workspace-dormant') !== next) {
        clip.setAttribute('data-ps-workspace-dormant', next)
      }
    }
  })

  /* Uniform outer scale — same canonical fit model as Hero settle. */
  useLayoutEffect(() => {
    if (simple || !isCompactViewport) {
      setDeviceFitScale(1)
      setDeviceFitSlot(null)
      return
    }

    const sticky = stickyRef.current
    const fit = deviceFitRef.current
    if (!sticky || !fit) return

    let raf = 0
    const measure = () => {
      const next = measureCanonicalDeviceFit({
        sticky,
        fit,
        padX: 24,
        padY: 28,
        cssVar: '--ps-device-fit-scale',
      })
      if (!next) return
      setDeviceFitScale(next.scale)
      setDeviceFitSlot({ w: next.slotW, h: next.slotH })
    }

    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [simple, isCompactViewport])

  useEffect(() => {
    if (simple) {
      progress.set(1)
      /*
       * PRM only — force completed handoff. Compact scroll must NOT do this
       * (it was killing Scene 07 portal ownership on mobile).
       */
      scene07HandoffMv.set(1)
      stickyRef.current?.setAttribute('data-ps-theater-owned', 'true')
      stickyRef.current
        ?.querySelector('[data-ps-visual-stage]')
        ?.setAttribute('data-ps-visual-active', 'true')
      cameraRef.current
        ?.querySelector('[data-ps-workspace-clip]')
        ?.setAttribute('data-ps-workspace-dormant', 'false')
      return
    }

    let raf = 0
    let removed = false
    let lastTab: ProductStoryTabId | null = null
    let lastTabProgress = -1
    let lastCover = -1
    let coverMeasured = false
    let navH = 68
    /**
     * Sticky progress when screen reveal completes — remaps tab scrub only.
     * Not used for visual visibility / device / paper / blackout.
     */
    let tabOriginP: number | null = null

    const syncNavH = () => {
      const el = trackRef.current
      if (!el) return
      const parsed = parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h'))
      if (Number.isFinite(parsed) && parsed > 0) navH = parsed
    }

    const measureCover = () => {
      const sticky = stickyRef.current
      const screen = cameraRef.current?.querySelector(
        '[data-tablet-screen]',
      ) as HTMLElement | null
      if (!sticky || !screen) return
      const next = computeProductCoverScale(sticky, screen, {
        isCompactViewport,
        fittedSlot: isCompactViewport ? deviceFitSlot : null,
      })
      if (Math.abs(next - lastCover) > 0.02) {
        lastCover = next
        coverScaleMv.set(next)
        trackRef.current?.setAttribute('data-cover-scale', next.toFixed(3))
      }
      coverMeasured = true
    }

    /*
     * Tab scrub only — device scale / ownership / blackout ride scene07HandoffMv.
     * Hero pattern: scroll → single rAF (no perpetual loop).
     */
    const measureTabs = () => {
      const el = trackRef.current
      if (!el) return

      const handoffT = scene07HandoffMv.get()
      if (productTheaterOwned(handoffT) && !coverMeasured) {
        measureCover()
      }

      const stickyP = stickyTrackProgress(el, navH, window.innerHeight)
      const revealT = screenRevealFromHandoff(handoffT)

      /* Diagnostic: freeze workspace internal motion after first reveal. */
      if (tabletDiag === 'static' && revealT >= 0.99) {
        progress.set(0)
        return
      }

      if (revealT < 0.99) {
        tabOriginP = null
        progress.set(0)
        if (lastTab !== 'overview') {
          lastTab = 'overview'
          lastTabProgress = 0
          setActiveTab('overview')
        }
        const workspace = cameraRef.current?.querySelector(
          '[data-testid="lv2-product-story-workspace"]',
        ) as HTMLElement | null
        workspace?.style.setProperty('--ps-tab-progress', '0')
        return
      }

      if (tabOriginP === null) {
        tabOriginP = stickyP
      }
      const origin = tabOriginP
      const p =
        origin >= 0.999
          ? 1
          : Math.min(1, Math.max(0, (stickyP - origin) / (1 - origin)))
      progress.set(p)

      const tab = tabFromProgress(p)
      const tabT = tabProgressFromMaster(p)
      if (tab !== lastTab) {
        lastTab = tab
        setActiveTab(tab)
      }
      if (Math.abs(tabT - lastTabProgress) > 0.008) {
        lastTabProgress = tabT
        const workspace = cameraRef.current?.querySelector(
          '[data-testid="lv2-product-story-workspace"]',
        ) as HTMLElement | null
        workspace?.style.setProperty('--ps-tab-progress', tabT.toFixed(4))
      }
    }

    const onScroll = () => {
      if (!activeRef.current) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measureTabs)
    }

    const onResize = () => {
      syncNavH()
      lastCover = -1
      coverMeasured = false
      onScroll()
    }

    syncNavH()
    const boot = scene07HandoffMv.get()
    const owned = productTheaterOwned(boot)
    const active = productVisualActive(boot)
    stickyRef.current?.setAttribute(
      'data-ps-theater-owned',
      owned ? 'true' : 'false',
    )
    stickyRef.current
      ?.querySelector('[data-ps-visual-stage]')
      ?.setAttribute('data-ps-visual-active', active ? 'true' : 'false')
    const bootClip = cameraRef.current?.querySelector(
      '[data-ps-workspace-clip]',
    ) as HTMLElement | null
    if (bootClip) {
      const forceDormant = tabletDiag === 'black' || tabletDiag === 'flat'
      const dormant = forceDormant || workspaceDormantFromHandoff(boot)
      bootClip.setAttribute('data-ps-workspace-dormant', dormant ? 'true' : 'false')
    }
    if (owned) measureCover()
    measureTabs()

    onBecameActiveRef.current = onScroll
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      onBecameActiveRef.current = null
      removed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      void removed
    }
  }, [
    simple,
    progress,
    coverScaleMv,
    tabletDiag,
    isCompactViewport,
    deviceFitSlot,
    activeRef,
    onBecameActiveRef,
  ])

  /* Re-measure cover when compact fit slot resolves. */
  useEffect(() => {
    if (simple || !isCompactViewport || !deviceFitSlot) return
    const sticky = stickyRef.current
    const screen = cameraRef.current?.querySelector(
      '[data-tablet-screen]',
    ) as HTMLElement | null
    if (!sticky || !screen) return
    if (!productTheaterOwned(scene07HandoffMv.get())) return
    const next = computeProductCoverScale(sticky, screen, {
      isCompactViewport: true,
      fittedSlot: deviceFitSlot,
    })
    coverScaleMv.set(next)
    trackRef.current?.setAttribute('data-cover-scale', next.toFixed(3))
  }, [simple, isCompactViewport, deviceFitSlot, coverScaleMv])

  /* Device scale — linear f(handoffT), Hero exitScale parity. */
  const deviceScale = useTransform(scene07HandoffMv, (t) =>
    deviceScaleFromHandoff(t, coverScaleMv.get()),
  )

  const stagePaperMv = useTransform(scene07HandoffMv, stagePaperFromHandoff)
  const screenBlackoutMv = useTransform(scene07HandoffMv, (t) => {
    /* BLACK / FLAT diagnostics: keep screen statically black for full travel. */
    if (tabletDiag === 'black' || tabletDiag === 'flat') return 1
    return screenBlackoutFromHandoff(t)
  })

  /*
   * Lifecycle exit — NEW post-Product channel only.
   * Does not alter scene07HandoffMv / entrance / tabs.
   * While Scene 07 handoff is incomplete, ignore exit clock so a stale
   * lifecycleExitMv=1 (e.g. static Lifecycle) cannot hide the tablet.
   */
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
  const lifecycleExitScale = useTransform(
    [lifecycleExitMv, scene07HandoffMv],
    (values: number[]) => {
      const exitT = values[0] ?? 0
      const handoffT = values[1] ?? 0
      if (handoffT < 0.995) return 1
      const e = Math.min(1, Math.max(0, exitT))
      return 1 - e * 0.04
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
  const lifecycleExitVeil = useTransform(
    [lifecycleExitMv, scene07HandoffMv],
    (values: number[]) => {
      const exitT = values[0] ?? 0
      const handoffT = values[1] ?? 0
      if (handoffT < 0.995) return 0
      return Math.min(1, Math.max(0, exitT * 1.35))
    },
  )

  useMotionValueEvent(lifecycleExitMv, 'change', (exitT) => {
    const sticky = stickyRef.current
    if (!sticky) return
    /* Entrance still owns the stage — never mark lifecycle-exit done. */
    if (scene07HandoffMv.get() < 0.995) {
      sticky.setAttribute('data-ps-lifecycle-exit', 'idle')
      return
    }
    const active = exitT > 0.001
    const done = exitT >= 0.995
    sticky.setAttribute('data-ps-lifecycle-exit', done ? 'done' : active ? 'active' : 'idle')
  })
  useMotionValueEvent(scene07HandoffMv, 'change', (handoffT) => {
    if (handoffT >= 0.995) return
    stickyRef.current?.setAttribute('data-ps-lifecycle-exit', 'idle')
  })

  const tabletFrame = (
    <HeroTabletFrame
      canonical
      fitLock={isCompactViewport}
      hardwareProgress={1}
    >
      <div
        className={styles.workspaceClip}
        data-ps-workspace-clip=""
        data-ps-workspace-dormant="true"
      >
<ProductStoryWorkspace activeTab={activeTab} wake={1} />
      </div>
    </HeroTabletFrame>
  )

  if (simple) {
    return (
      <section
        className={styles.productTrack}
        data-testid="lv2-product-story"
        data-product-theater="static"
        aria-labelledby="lv2-product-heading"
      >
        <h2 id="lv2-product-heading" className={styles.visuallyHidden}>
          Jedno zlecenie w OurWed
        </h2>
        <div className={styles.staticStack}>
          {/*
           * PRM static — still canonical geometry (never data-compact reflow).
           * Outer CSS constrains width; internals stay 1420 design canvas.
           */}
          <HeroTabletFrame canonical hardwareProgress={1} blackout={0}>
<ProductStoryWorkspace activeTab="overview" wake={1} />
          </HeroTabletFrame>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={trackRef}
      className={styles.productTrack}
      data-testid="lv2-product-story"
      data-product-theater="scroll"
      data-cover-scale={coverFallback.toFixed(3)}
      data-screen-reveal-start={PRODUCT_SCREEN_REVEAL.start}
      data-screen-reveal-end={PRODUCT_SCREEN_REVEAL.end}
      data-ps-tablet-diag={tabletDiag}
      aria-labelledby="lv2-product-heading"
    >
      <h2 id="lv2-product-heading" className={styles.visuallyHidden}>
        Jedno zlecenie w OurWed
      </h2>

      <div
        ref={stickyRef}
        className={styles.stickyStage}
        data-product-sticky-stage=""
        data-ps-theater-owned="false"
        data-ps-tablet-diag={tabletDiag}
      >
        <div
          className={styles.visualStage}
          data-ps-visual-stage=""
          data-ps-visual-active="false"
        >
          <motion.div
            className={styles.paperPlate}
            data-ps-paper-plate=""
            style={{ opacity: stagePaperMv }}
            aria-hidden
          />
          <div className={styles.stageInner}>
            <motion.div
              className={styles.deviceExit}
              data-ps-device-exit=""
              style={{
                y: lifecycleExitY,
                scale: lifecycleExitScale,
                opacity: lifecycleExitOpacity,
              }}
            >
              <motion.div
                ref={cameraRef}
                className={styles.deviceCamera}
                data-ps-device-camera=""
                style={{
                  scale: deviceScale,
                  ['--screen-blackout' as string]: screenBlackoutMv,
                }}
              >
                <div
                  className={styles.deviceFitSlot}
                  data-ps-device-fit={isCompactViewport ? 'scale' : 'none'}
                  style={
                    isCompactViewport && deviceFitSlot
                      ? { width: deviceFitSlot.w, height: deviceFitSlot.h }
                      : undefined
                  }
                >
                  <div
                    ref={deviceFitRef}
                    className={styles.deviceFit}
                    data-ps-device-fit-scale={deviceFitScale.toFixed(4)}
                    style={
                      isCompactViewport
                        ? {
                            ['--ps-device-fit-scale' as string]: deviceFitScale,
                          }
                        : undefined
                    }
                  >
                    {tabletFrame}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
          <motion.div
            className={styles.exitVeil}
            data-ps-exit-veil=""
            style={{ opacity: lifecycleExitVeil }}
            aria-hidden
          />
        </div>
      </div>
    </section>
  )
}

export { SCENE07_HANDOFF_CSS_VAR } from '@/features/landing-v2/product-story/productStoryProgress'
