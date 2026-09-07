import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'framer-motion'
import { LandingButton } from '@/features/landing-v3/components/LandingButton'
import {
  HeroModernDashboard,
  type HeroModernRevealStyles,
} from '@/features/landing-v2/hero/HeroModernDashboard'
import { HeroTabletFrame } from '@/features/landing-v2/hero/HeroTabletFrame'
import { applyHeroDemoThemeToElement } from '@/features/landing-v2/hero/heroDemoThemeInterpolation'
import { heroTheaterGeometry, compactHeroExitCoverScale } from '@/features/landing-v2/hero/heroTheaterGeometry'
import { measureCanonicalDeviceFit } from '@/features/landing-v2/hero/landingTabletFit'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import { useTheaterScrollGate } from '@/features/landing-v2/motion/useTheaterScrollGate'
import styles from './LandingV2Hero.module.css'

/**
 * Landing V2 Hero — monumental message → Modern product → late iPad
 * → physical push-in / screen blackout handoff into the Problem Story.
 *
 * Master progress 0–1 spans assemble + hold + exit + black settle.
 * Existing reveal keyframes run on assembleProgress (0–1 remapped).
 *
 * Motion policy: prefers-reduced-motion disables the theater.
 * Compact viewport only adapts outer geometry / device fit-scale —
 * never the tablet's internal dashboard composition.
 */
export function LandingV2Hero() {
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const exitWrapRef = useRef<HTMLDivElement | null>(null)
  const deviceFitRef = useRef<HTMLDivElement | null>(null)
  const isReducedMotion = Boolean(useReducedMotion())
  const isCompactViewport = useLandingCompactViewport()
  const geom = heroTheaterGeometry(isCompactViewport)
  const [coverScale, setCoverScale] = useState(geom.coverScaleMin)
  const [exitLift, setExitLift] = useState(0)
  const [deviceFitScale, setDeviceFitScale] = useState(1)
  const [deviceFitSlot, setDeviceFitSlot] = useState<{ w: number; h: number } | null>(
    null,
  )
  const progress = useMotionValue(0)
  const baseScreenRef = useRef<{ w: number; h: number } | null>(null)

  /* Theater runs on compact; only accessibility reduces to static. */
  const skipTheater = isReducedMotion
  const { activeRef, onBecameActiveRef } = useTheaterScrollGate(
    trackRef,
    !skipTheater,
  )

  useEffect(() => {
    if (skipTheater) {
      progress.set(1)
      return
    }

    const el = trackRef.current
    if (!el) return

    let raf = 0
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const total = Math.max(1, el.offsetHeight - window.innerHeight)
      const raw = -rect.top / total
      progress.set(Math.min(1, Math.max(0, raw)))
    }

    const onScroll = () => {
      if (!activeRef.current) return
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
  }, [skipTheater, progress, activeRef, onBecameActiveRef])

  /* Uniform outer scale — canonical tablet → fit sticky stage */
  useLayoutEffect(() => {
    if (!isCompactViewport) {
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
        padX: skipTheater ? 32 : 24,
        padY: skipTheater ? 40 : 28,
        cssVar: '--hero-device-fit-scale',
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
    /* Hardware outset grows during assemble — keep fit scale honest */
    const unsub = progress.on('change', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      unsub()
    }
  }, [isCompactViewport, skipTheater, progress])

  useMotionValueEvent(progress, 'change', (v) => {
    const node = trackRef.current
    if (node) node.style.setProperty('--hero-progress', v.toFixed(4))

    /* Theme interpolation — tied to master progress (same source as scroll theater) */
    const dash = exitWrapRef.current?.querySelector(
      '[data-testid="lv2-hero-modern-dashboard"]',
    ) as HTMLElement | null
    if (dash) {
      const themeT = Math.min(1, Math.max(0, (v - 0.54) / 0.1))
      applyHeroDemoThemeToElement(dash, themeT)
    }
  })

  /*
   * Master progress map (desktop scroll theater):
   * 0.00–0.50  assemble (existing reveal, remapped)
   * 0.50–0.54  hold complete Light iPad
   * 0.54–0.64  theme transition Light → Graphite
   * 0.64–0.70  hold complete Graphite
   * 0.70–0.91  exit: scale + blackout (unchanged geometry)
   * 0.91–0.94  tiny pure-black beat → Problem Story handoff
   *
   * Compact keeps the same progress windows; only px/scale ranges change.
   */
  const assembleProgress = useTransform(progress, [0, 0.5], [0, 1])

  const themeProgressMv = useTransform(progress, [0.54, 0.64], [0, 1])

  /* Hardware resolves AFTER product modules — never an empty iPad around the headline */
  const hardwareMv = useTransform(assembleProgress, [0.76, 0.92], [0, 1])

  const copyOpacity = useTransform(assembleProgress, [0, 0.18, 0.34], [1, 1, 0])
  const copyY = useTransform(assembleProgress, [0.18, 0.34], geom.copyY)
  const copyScale = useTransform(assembleProgress, [0.18, 0.34], [1, 0.98])

  const productY = useTransform(
    assembleProgress,
    [0.14, 0.22, 0.46, 0.8],
    geom.productY,
  )
  const productOpacity = useTransform(
    assembleProgress,
    [0.12, 0.2, 0.3, 0.36],
    [0, 0.55, 0.95, 1],
  )
  const productScale = useTransform(
    assembleProgress,
    [0.22, 0.42, 0.8],
    geom.productScale,
  )

  const shellOpacity = useTransform(assembleProgress, [0.18, 0.34], [0, 1])
  const shellY = useTransform(assembleProgress, [0.18, 0.34], geom.shellY)
  const greetingOpacity = useTransform(assembleProgress, [0.2, 0.36], [0, 1])
  const greetingY = useTransform(assembleProgress, [0.2, 0.36], geom.greetingY)

  const nearestOpacity = useTransform(assembleProgress, [0.28, 0.46], [0, 1])
  const nearestY = useTransform(assembleProgress, [0.28, 0.46], geom.nearestY)
  const nearestScale = useTransform(assembleProgress, [0.28, 0.46], [0.97, 1])

  const upcomingLabelOpacity = useTransform(assembleProgress, [0.42, 0.52], [0, 1])
  const upcomingLabelY = useTransform(assembleProgress, [0.42, 0.52], [18, 0])

  const u0Opacity = useTransform(assembleProgress, [0.42, 0.54], [0, 1])
  const u0Y = useTransform(assembleProgress, [0.42, 0.54], geom.upcomingY)
  const u1Opacity = useTransform(assembleProgress, [0.445, 0.56], [0, 1])
  const u1Y = useTransform(assembleProgress, [0.445, 0.56], geom.upcomingY)
  const u2Opacity = useTransform(assembleProgress, [0.47, 0.58], [0, 1])
  const u2Y = useTransform(assembleProgress, [0.47, 0.58], geom.upcomingY)

  const todayOpacity = useTransform(assembleProgress, [0.52, 0.66], [0, 1])
  const todayY = useTransform(assembleProgress, [0.52, 0.66], [20, 0])

  const notifOpacity = useTransform(assembleProgress, [0.62, 0.76], [0, 1])
  const notifY = useTransform(assembleProgress, [0.62, 0.76], geom.moduleY)

  const deadlineOpacity = useTransform(assembleProgress, [0.66, 0.8], [0, 1])
  const deadlineY = useTransform(assembleProgress, [0.66, 0.8], geom.moduleY)

  const peekHintOpacity = useTransform(assembleProgress, [0, 0.12, 0.22], [0.7, 0.4, 0])

  /* Exit theater — whole physical device from one wrapper (after Graphite hold) */
  const exitProgress = useTransform(progress, [0.7, 0.91], [0, 1])
  const blackoutMv = useTransform(
    exitProgress,
    [0, 0.15, 0.35, 0.55, 0.72, 0.84, 1],
    [0, 0.05, 0.25, 0.65, 0.92, 1, 1],
  )
  const exitScaleMv = useTransform(exitProgress, [0, 1], [1, coverScale])
  const exitYMv = useTransform(exitProgress, [0, 1], [0, exitLift])
  const blackPlateOpacity = useTransform(exitProgress, [0.5, 0.78, 0.92], [0, 0.55, 1])

  /* Capture geometry once assemble is complete — compute cover scale */
  useMotionValueEvent(assembleProgress, 'change', (v) => {
    if (skipTheater || v < 0.98) return
    const sticky = stickyRef.current
    if (!sticky) return
    const st = sticky.getBoundingClientRect()

    if (isCompactViewport) {
      /*
       * Portrait: landscape tablet is short vs stage height. Derive exit
       * scale from fitted device height so chassis clears top + bottom.
       * Prefer deviceFitSlot (post fit-scale layout) over screen-only math.
       */
      const fittedH =
        deviceFitSlot?.h ??
        (
          exitWrapRef.current?.querySelector(
            '[data-testid="lv2-hero-tablet"]',
          ) as HTMLElement | null
        )?.offsetHeight ??
        0
      const next = compactHeroExitCoverScale({
        stickyHeight: st.height,
        fittedTabletHeight: fittedH,
        overscan: geom.exitVerticalOverscan,
        min: geom.coverScaleMin,
        max: geom.coverScaleMax,
      })
      setCoverScale(next)

      const device = exitWrapRef.current?.querySelector(
        '[data-testid="lv2-hero-tablet"]',
      ) as HTMLElement | null
      if (device) {
        const dr = device.getBoundingClientRect()
        const deviceCenterY = dr.top + dr.height / 2
        const stickyCenterY = st.top + st.height / 2
        setExitLift(stickyCenterY - deviceCenterY)
      }
      return
    }

    const screen = exitWrapRef.current?.querySelector(
      '[data-tablet-screen]',
    ) as HTMLElement | null
    if (!screen) return

    const sr = screen.getBoundingClientRect()
    if (sr.width < 40 || sr.height < 40) return

    if (!baseScreenRef.current) {
      baseScreenRef.current = { w: sr.width, h: sr.height }
    }
    const base = baseScreenRef.current
    const needX = st.width / base.w
    const needY = st.height / base.h
    /* Safety so SCREEN — not merely body — overshoots viewport; hardware exits */
    const next = Math.max(needX, needY) * geom.coverScaleSafety
    setCoverScale(
      Math.min(geom.coverScaleMax, Math.max(geom.coverScaleMin, next)),
    )

    const screenCenterY = sr.top + sr.height / 2
    const stickyCenterY = st.top + st.height / 2
    setExitLift(stickyCenterY - screenCenterY)
  })

  /* Recompute compact overscan when fit slot settles after hardware growth */
  useEffect(() => {
    if (skipTheater || !isCompactViewport || !deviceFitSlot) return
    if (assembleProgress.get() < 0.98) return
    const sticky = stickyRef.current
    if (!sticky) return
    const next = compactHeroExitCoverScale({
      stickyHeight: sticky.getBoundingClientRect().height,
      fittedTabletHeight: deviceFitSlot.h,
      overscan: geom.exitVerticalOverscan,
      min: geom.coverScaleMin,
      max: geom.coverScaleMax,
    })
    setCoverScale(next)
  }, [
    skipTheater,
    isCompactViewport,
    deviceFitSlot,
    assembleProgress,
    geom.exitVerticalOverscan,
    geom.coverScaleMin,
    geom.coverScaleMax,
  ])

  useEffect(() => {
    if (skipTheater) return
    const onResize = () => {
      baseScreenRef.current = null
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [skipTheater])

  useEffect(() => {
    baseScreenRef.current = null
    setCoverScale(geom.coverScaleMin)
  }, [isCompactViewport, geom.coverScaleMin])

  const reveal: HeroModernRevealStyles | undefined = skipTheater
    ? undefined
    : {
        shell: { opacity: shellOpacity, y: shellY },
        greeting: { opacity: greetingOpacity, y: greetingY },
        nearest: {
          opacity: nearestOpacity,
          y: nearestY,
          scale: nearestScale,
        },
        upcomingLabel: { opacity: upcomingLabelOpacity, y: upcomingLabelY },
        upcoming0: { opacity: u0Opacity, y: u0Y },
        upcoming1: { opacity: u1Opacity, y: u1Y },
        upcoming2: { opacity: u2Opacity, y: u2Y },
        today: { opacity: todayOpacity, y: todayY },
        notifications: { opacity: notifOpacity, y: notifY },
        deadlines: { opacity: deadlineOpacity, y: deadlineY },
      }

  const tablet = (
    <HeroTabletFrame
      canonical
      fitLock={isCompactViewport}
      hardwareProgress={skipTheater ? 1 : undefined}
    >
      <HeroModernDashboard
        revealComplete={skipTheater}
        reveal={skipTheater ? undefined : reveal}
        themeProgress={skipTheater ? undefined : themeProgressMv}
      />
    </HeroTabletFrame>
  )

  const fittedTablet = (
    <div
      className={styles.deviceFitSlot}
      data-hero-device-fit={isCompactViewport ? 'scale' : 'none'}
      style={
        isCompactViewport && deviceFitSlot
          ? { width: deviceFitSlot.w, height: deviceFitSlot.h }
          : undefined
      }
    >
      <div
        ref={deviceFitRef}
        className={styles.deviceFit}
        data-hero-device-fit-scale={deviceFitScale.toFixed(4)}
        style={
          {
            ['--hero-device-fit-scale' as string]: isCompactViewport
              ? deviceFitScale
              : 1,
          } as CSSProperties
        }
      >
        {tablet}
      </div>
    </div>
  )

  return (
    <section
      ref={trackRef}
      className={styles.track}
      data-testid="lv2-hero"
      data-landing-v2-hero=""
      data-hero-theater={skipTheater ? 'simple' : 'scroll'}
      data-hero-compact={isCompactViewport ? 'true' : 'false'}
      data-hero-reduced-motion={isReducedMotion ? 'true' : 'false'}
      aria-labelledby="lv2-hero-title"
      style={{ ['--hero-progress' as string]: 0 }}
    >
      <div ref={stickyRef} className={styles.sticky} data-lv2-hero-sticky="">
        {skipTheater ? (
          <div className={styles.simpleStack}>
            <div className={styles.copy}>
              <h1 id="lv2-hero-title" className={styles.title}>
                <span className={styles.titleLine}>Obsługa zleceń ślubnych</span>
                <span className={styles.titleLine}>bez chaosu.</span>
              </h1>
              <p className={styles.support}>
                Śluby, sesje, umowy, ankiety, płatności i plan dnia — w jednym
                spokojnym miejscu pracy.
              </p>
              <div className={styles.ctas}>
                <LandingButton to="/register" variant="primary">
                  Załóż bezpłatne konto
                </LandingButton>
              </div>
              <p className={styles.micro}>Bez karty płatniczej.</p>
            </div>
            <div className={styles.simpleStage} data-testid="lv2-hero-stage">
              {fittedTablet}
            </div>
          </div>
        ) : (
          <>
            <motion.div
              className={styles.copy}
              style={{
                opacity: copyOpacity,
                y: copyY,
                scale: copyScale,
              }}
            >
              <h1 id="lv2-hero-title" className={styles.title}>
                <span className={styles.titleLine}>Obsługa zleceń ślubnych</span>
                <span className={styles.titleLine}>bez chaosu.</span>
              </h1>
              <p className={styles.support}>
                Śluby, sesje, umowy, ankiety, płatności i plan dnia — w jednym
                spokojnym miejscu pracy.
              </p>
              <div className={styles.ctas}>
                <LandingButton to="/register" variant="primary">
                  Załóż bezpłatne konto
                </LandingButton>
              </div>
              <p className={styles.micro}>Bez karty płatniczej.</p>
              <motion.p
                className={styles.scrollHint}
                style={{ opacity: peekHintOpacity }}
                aria-hidden
              >
                Przewiń, aby zobaczyć pulpit
              </motion.p>
            </motion.div>

            <motion.div
              className={styles.blackPlate}
              style={{ opacity: blackPlateOpacity }}
              aria-hidden
            />

            <motion.div
              className={styles.stage}
              data-testid="lv2-hero-stage"
              aria-hidden
              style={{
                y: productY,
                opacity: productOpacity,
                scale: productScale,
                ['--hardware-progress' as string]: hardwareMv,
                ['--screen-blackout' as string]: blackoutMv,
                ['--demo-theme-progress' as string]: themeProgressMv,
              }}
            >
              {/*
                Single physical transform wrapper — body, bezel, screen,
                camera, and buttons scale/translate together.
                Mobile fit-scale is nested inside so exit morph stays uniform.
              */}
              <motion.div
                ref={exitWrapRef}
                className={styles.deviceExit}
                data-lv2-device-exit=""
                style={{
                  scale: exitScaleMv,
                  y: exitYMv,
                }}
              >
                {fittedTablet}
              </motion.div>
            </motion.div>
          </>
        )}
      </div>
    </section>
  )
}
