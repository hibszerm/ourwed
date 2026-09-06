import { useEffect, useRef } from 'react'
import type { MotionValue } from 'framer-motion'
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'
import {
  AtlasAnkiety,
  AtlasFinanse,
  AtlasKalendarz,
  AtlasPakiety,
  AtlasPowiadomienia,
  AtlasSesje,
  AtlasSluby,
  AtlasUmowy,
  AtlasZadania,
} from '@/features/landing-v2/features-grid/FeatureMiniUis'
import {
  ATLAS_MODULES,
  FEATURE_CARDS,
  type FeatureId,
} from '@/features/landing-v2/features-grid/featuresData'
import { lifecycleProgressMv } from '@/features/landing-v2/lifecycle-story/lifecycleExitClock'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import styles from './LandingV2FeaturesGrid.module.css'

const SCENES = {
  finanse: AtlasFinanse,
  powiadomienia: AtlasPowiadomienia,
  zadania: AtlasZadania,
  umowy: AtlasUmowy,
  pakiety: AtlasPakiety,
  sluby: AtlasSluby,
  sesje: AtlasSesje,
  kalendarz: AtlasKalendarz,
  ankiety: AtlasAnkiety,
} as const satisfies Record<FeatureId, typeof AtlasFinanse>

/** Canonical atlas order (FEATURE_CARDS ≡ ATLAS_MODULES). */
const MODULES = ATLAS_MODULES satisfies typeof FEATURE_CARDS

/** Restrained stagger — atlas modules materialize in editorial order. */
const MODULE_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [0.1, 0.36],
  [0.12, 0.38],
  [0.14, 0.4],
  [0.16, 0.42],
  [0.18, 0.44],
  [0.2, 0.46],
  [0.22, 0.48],
  [0.24, 0.5],
  [0.26, 0.52],
]

const COMPACT_EASE = [0.22, 1, 0.36, 1] as const

/**
 * Desktop header clock only (frozen).
 * Compact intro is keyed to lifecycleProgressMv — not Features scroll —
 * so heading and workspace share one deliberate overlap window.
 */
const HEADER_OFFSET_DESKTOP: ['start 0.92', 'start 0.5'] = ['start 0.92', 'start 0.5']

/**
 * Compact Lifecycle progress → Features intro (synced with workspace exit 0.76→0.98).
 * Heading starts after workspace begins leaving; finishes before track end.
 */
const COMPACT_HEADING_P_START = 0.82
const COMPACT_HEADING_P_END = 0.98
/** Lead follows heading — readable after heading is underway. */
const COMPACT_LEAD_P_START = 0.88
const COMPACT_LEAD_P_END = 1
/** First card (Finanse) waits until intro is mostly established. */
const COMPACT_FIRST_CARD_P = 0.95
const COMPACT_HEADING_Y = 10
const COMPACT_LEAD_Y = 8

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function easeOut(t: number) {
  const x = clamp01(t)
  return 1 - (1 - x) ** 3
}

function rangeEase(p: number, start: number, end: number) {
  return easeOut(clamp01((p - start) / Math.max(1e-6, end - start)))
}

/**
 * Landing V2 — OurWed Product Atlas.
 * Desktop: asymmetric 12-column editorial grid; hover micro-motion is CSS-only.
 * Compact: vertical editorial stack; each card reveals via whileInView (not one parent clock).
 */
export function LandingV2FeaturesGrid() {
  const reduced = useReducedMotion()
  const isCompactViewport = useLandingCompactViewport()
  const sectionRef = useRef<HTMLElement | null>(null)
  const revealRef = useRef<HTMLDivElement | null>(null)
  const compactHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const compactLeadRef = useRef<HTMLParagraphElement | null>(null)
  const forced = useMotionValue(reduced ? 1 : 0)
  /** Latch: once Lifecycle intro is established, Finanse may reveal (never re-locks). */
  const firstCardLatch = useMotionValue(
    isCompactViewport && lifecycleProgressMv.get() >= COMPACT_FIRST_CARD_P ? 1 : 0,
  )

  /**
   * Grid modules — FROZEN handoff offset (do not change card choreography).
   * Progress 0→1 as the reveal anchor start moves from 60% → 40% of the viewport.
   * Desktop only; compact cards use per-card whileInView instead.
   */
  const { scrollYProgress } = useScroll({
    target: revealRef,
    offset: ['start 0.6', 'start 0.4'],
  })

  /**
   * Headline / lead — desktop only scroll clock (frozen).
   * Compact binds to lifecycleProgressMv so intro overlaps workspace exit.
   */
  const { scrollYProgress: headerScrollYProgress } = useScroll({
    target: revealRef,
    offset: HEADER_OFFSET_DESKTOP,
  })

  useEffect(() => {
    forced.set(reduced ? 1 : 0)
  }, [reduced, forced])

  useEffect(() => {
    if (!isCompactViewport) {
      firstCardLatch.set(1)
      return
    }
    /* Fresh compact mount: re-evaluate from live Lifecycle progress (avoid stale HMR latch). */
    firstCardLatch.set(lifecycleProgressMv.get() >= COMPACT_FIRST_CARD_P ? 1 : 0)
  }, [isCompactViewport, firstCardLatch])

  useMotionValueEvent(lifecycleProgressMv, 'change', (p) => {
    if (!isCompactViewport) return
    if (p >= COMPACT_FIRST_CARD_P) firstCardLatch.set(1)
  })

  const reveal = useTransform([scrollYProgress, forced], ([p, f]) =>
    Math.max(Number(p), Number(f)),
  )
  const headerReveal = useTransform([headerScrollYProgress, forced], ([p, f]) =>
    Math.max(Number(p), Number(f)),
  )

  /* Compact: calm opacity + tiny y from Lifecycle progress. Desktop unchanged. */
  const compactIntroRef = useRef(isCompactViewport)
  compactIntroRef.current = isCompactViewport
  const headingTravel = isCompactViewport ? COMPACT_HEADING_Y : 28
  const leadTravel = isCompactViewport ? COMPACT_LEAD_Y : 22
  const headingTravelRef = useRef(headingTravel)
  const leadTravelRef = useRef(leadTravel)
  headingTravelRef.current = headingTravel
  leadTravelRef.current = leadTravel

  const headingOp = useTransform(
    [lifecycleProgressMv, headerReveal],
    ([lifeP, headerT]) => {
      if (compactIntroRef.current) {
        return rangeEase(Number(lifeP), COMPACT_HEADING_P_START, COMPACT_HEADING_P_END)
      }
      return easeOut(clamp01(Number(headerT) / 0.3))
    },
  )
  const headingY = useTransform(
    [lifecycleProgressMv, headerReveal],
    ([lifeP, headerT]) => {
      if (compactIntroRef.current) {
        return (
          (1 - rangeEase(Number(lifeP), COMPACT_HEADING_P_START, COMPACT_HEADING_P_END)) *
          headingTravelRef.current
        )
      }
      return (1 - easeOut(clamp01(Number(headerT) / 0.3))) * headingTravelRef.current
    },
  )
  const headingBlur = useTransform(headerReveal, (t) => {
    const b = (1 - easeOut(clamp01(t / 0.3))) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  const leadOp = useTransform(
    [lifecycleProgressMv, headerReveal],
    ([lifeP, headerT]) => {
      if (compactIntroRef.current) {
        return rangeEase(Number(lifeP), COMPACT_LEAD_P_START, COMPACT_LEAD_P_END)
      }
      return easeOut(clamp01((Number(headerT) - 0.06) / 0.28))
    },
  )
  const leadY = useTransform(
    [lifecycleProgressMv, headerReveal],
    ([lifeP, headerT]) => {
      if (compactIntroRef.current) {
        return (
          (1 - rangeEase(Number(lifeP), COMPACT_LEAD_P_START, COMPACT_LEAD_P_END)) *
          leadTravelRef.current
        )
      }
      return (1 - easeOut(clamp01((Number(headerT) - 0.06) / 0.28))) * leadTravelRef.current
    },
  )
  const leadBlur = useTransform(headerReveal, (t) => {
    const b = (1 - easeOut(clamp01((t - 0.06) / 0.28))) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  /**
   * Compact intro: bind opacity + subtle y onto plain HTML nodes
   * (no motion.* filter layer — Framer blur(0px) softens type).
   */
  useEffect(() => {
    if (!isCompactViewport) return
    const apply = () => {
      const h = compactHeadingRef.current
      const l = compactLeadRef.current
      const hy = headingY.get()
      const ly = leadY.get()
      if (h) {
        h.style.opacity = String(headingOp.get())
        h.style.transform = Math.abs(hy) < 0.15 ? 'none' : `translateY(${hy.toFixed(2)}px)`
        h.style.filter = 'none'
      }
      if (l) {
        l.style.opacity = String(leadOp.get())
        l.style.transform = Math.abs(ly) < 0.15 ? 'none' : `translateY(${ly.toFixed(2)}px)`
        l.style.filter = 'none'
      }
    }
    apply()
    const offs = [
      headingOp.on('change', apply),
      leadOp.on('change', apply),
      headingY.on('change', apply),
      leadY.on('change', apply),
    ]
    return () => {
      offs.forEach((off) => off())
    }
  }, [isCompactViewport, headingOp, leadOp, headingY, leadY])

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      data-testid="lv2-features-grid"
      data-lv2-features=""
      data-features-layout={isCompactViewport ? 'compact' : 'desktop'}
      aria-labelledby="lv2-features-heading"
    >
      <div className={styles.inner}>
        <div ref={revealRef} className={styles.revealAnchor} data-lv2-features-reveal="">
          <header className={styles.header} data-features-intro="">
            {isCompactViewport ? (
              <>
                <h2
                  ref={compactHeadingRef}
                  id="lv2-features-heading"
                  className={styles.heading}
                  data-features-heading=""
                  data-features-intro-motion="dom"
                  style={{ opacity: 0 }}
                >
                  Kilka funkcji, które ułatwią Ci pracę
                </h2>
                <p
                  ref={compactLeadRef}
                  className={styles.lead}
                  data-features-lead=""
                  data-features-intro-motion="dom"
                  style={{ opacity: 0 }}
                >
                  Wszystko, czego potrzebujesz do prowadzenia zleceń — w jednym miejscu.
                </p>
              </>
            ) : (
              <>
                <motion.h2
                  id="lv2-features-heading"
                  className={styles.heading}
                  data-features-heading=""
                  style={{ opacity: headingOp, y: headingY, filter: headingBlur }}
                >
                  Kilka funkcji, które ułatwią Ci pracę
                </motion.h2>
                <motion.p
                  className={styles.lead}
                  data-features-lead=""
                  style={{ opacity: leadOp, y: leadY, filter: leadBlur }}
                >
                  Wszystko, czego potrzebujesz do prowadzenia zleceń — w jednym miejscu.
                </motion.p>
              </>
            )}
          </header>
        </div>

        <ul className={styles.atlas} data-lv2-features-atlas="">
          {MODULES.map((feature, index) => {
            const Scene = SCENES[feature.id]
            const [start, end] = MODULE_WINDOWS[index] ?? [0.28, 0.58]
            return (
              <AtlasModule
                key={feature.id}
                id={feature.id}
                title={feature.title}
                description={feature.description}
                colSpan={feature.colSpan}
                reveal={reveal}
                start={start}
                end={end}
                Scene={Scene}
                compact={isCompactViewport}
                reduced={Boolean(reduced)}
                cardIndex={index}
                firstCardLatch={firstCardLatch}
              />
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function AtlasModule({
  id,
  title,
  description,
  colSpan,
  reveal,
  start,
  end,
  Scene,
  compact,
  reduced,
  cardIndex,
  firstCardLatch,
}: {
  id: FeatureId
  title: string
  description: string
  colSpan: number
  reveal: MotionValue<number>
  start: number
  end: number
  Scene: (typeof SCENES)[FeatureId]
  compact: boolean
  reduced: boolean
  cardIndex: number
  firstCardLatch: MotionValue<number>
}) {
  const local = useTransform(reveal, (t) => easeOut(clamp01((t - start) / (end - start))))
  const opacity = useTransform(local, (v) => v)
  const y = useTransform(local, (v) => (1 - v) * 28)
  const blur = useTransform(local, (v) => {
    const b = (1 - v) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  const compactMotion = compact && !reduced
  /* First card waits until Lifecycle intro threshold; later cards stay local. */
  const firstCard = cardIndex === 0
  const firstCardSmooth = useSpring(firstCardLatch, {
    stiffness: 110,
    damping: 24,
    mass: 0.7,
  })
  const firstCardOp = useTransform(firstCardSmooth, (v) =>
    firstCard && compactMotion ? clamp01(Number(v)) : 1,
  )
  const firstCardY = useTransform(firstCardSmooth, (v) =>
    firstCard && compactMotion ? (1 - clamp01(Number(v))) * 12 : 0,
  )
  const viewport =
    compactMotion && !firstCard
      ? { once: true as const, amount: 0.22, margin: '0px 0px -12% 0px' }
      : undefined

  return (
    <motion.li
      className={styles.module}
      data-feature={id}
      data-lv2-feature-module=""
      data-feature-hover-surface="module"
      data-col-span={colSpan}
      data-feature-reveal={compactMotion ? (firstCard ? 'lifecycle-latch' : 'viewport') : 'atlas'}
      data-feature-card-index={cardIndex}
      /* Compact: never bind atlas blur MotionValues — leftover filter:blur(3px) softens cards. */
      style={
        compactMotion && firstCard
          ? { opacity: firstCardOp, y: firstCardY, filter: 'none' }
          : compactMotion
            ? { filter: 'none' }
            : compact && reduced
              ? { opacity: 1, y: 0, filter: 'none' }
              : { opacity, y, filter: blur }
      }
      initial={compactMotion && !firstCard ? { opacity: 0, y: 12, filter: 'none' } : false}
      whileInView={
        compactMotion && !firstCard
          ? { opacity: 1, y: 0, filter: 'none' }
          : undefined
      }
      viewport={viewport}
      transition={
        compactMotion && !firstCard
          ? { duration: 0.5, ease: COMPACT_EASE }
          : undefined
      }
    >
      <div className={styles.moduleCopy}>
        <h3 className={styles.moduleTitle}>{title}</h3>
        <p className={styles.moduleDesc}>{description}</p>
      </div>
      <div className={styles.moduleScene} aria-hidden>
        <Scene />
      </div>
    </motion.li>
  )
}
