import { useEffect, useRef } from 'react'
import type { MotionValue } from 'framer-motion'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
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

/** Shared compact card entrance — opacity-led, calm y + tiny scale, no blur. */
const COMPACT_CARD_REVEAL = {
  initial: { opacity: 0, y: 22, scale: 0.995, filter: 'none' as const },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'none' as const },
  transition: { duration: 0.82, ease: COMPACT_EASE },
  /** Start as the card's lower edge enters — earlier than late reading-zone trip. */
  viewport: { once: true as const, amount: 0.12, margin: '0px 0px 12% 0px' },
} as const

/** Desktop header clock (frozen). */
const HEADER_OFFSET_DESKTOP: ['start 0.92', 'start 0.5'] = ['start 0.92', 'start 0.5']

/**
 * Compact: local viewport clock — reveal early as heading enters from below
 * after Lifecycle sticky release (normal document flow, no Lifecycle coupling).
 */
const HEADER_OFFSET_COMPACT: ['start 0.98', 'start 0.52'] = ['start 0.98', 'start 0.52']

const COMPACT_HEADING_Y = 12
const COMPACT_LEAD_Y = 8
/** Lead starts after heading is underway on the local header clock. */
const COMPACT_LEAD_DELAY = 0.18
const COMPACT_HEADING_OP_SPAN = 0.42
const COMPACT_LEAD_OP_SPAN = 0.45

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function easeOut(t: number) {
  const x = clamp01(t)
  return 1 - (1 - x) ** 3
}

/**
 * Landing V2 — OurWed Product Atlas.
 * Desktop: asymmetric 12-column editorial grid; hover micro-motion is CSS-only.
 * Compact: vertical editorial stack; intro + cards use local viewport reveal.
 */
export function LandingV2FeaturesGrid() {
  const reduced = useReducedMotion()
  const isCompactViewport = useLandingCompactViewport()
  const sectionRef = useRef<HTMLElement | null>(null)
  const revealRef = useRef<HTMLDivElement | null>(null)
  const compactHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const compactLeadRef = useRef<HTMLParagraphElement | null>(null)
  const forced = useMotionValue(reduced ? 1 : 0)

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
   * Headline / lead — local scroll clock (compact + desktop).
   * Compact uses HEADER_OFFSET_COMPACT; desktop keeps HEADER_OFFSET_DESKTOP.
   * Not driven by Lifecycle progress.
   */
  const { scrollYProgress: headerScrollYProgress } = useScroll({
    target: revealRef,
    offset: isCompactViewport ? HEADER_OFFSET_COMPACT : HEADER_OFFSET_DESKTOP,
  })

  useEffect(() => {
    forced.set(reduced ? 1 : 0)
  }, [reduced, forced])

  const reveal = useTransform([scrollYProgress, forced], ([p, f]) =>
    Math.max(Number(p), Number(f)),
  )
  const headerReveal = useTransform([headerScrollYProgress, forced], ([p, f]) =>
    Math.max(Number(p), Number(f)),
  )

  const compactIntroRef = useRef(isCompactViewport)
  compactIntroRef.current = isCompactViewport
  const headingTravel = isCompactViewport ? COMPACT_HEADING_Y : 28
  const leadTravel = isCompactViewport ? COMPACT_LEAD_Y : 22
  const headingTravelRef = useRef(headingTravel)
  const leadTravelRef = useRef(leadTravel)
  headingTravelRef.current = headingTravel
  leadTravelRef.current = leadTravel

  const headingOp = useTransform(headerReveal, (t) => {
    if (compactIntroRef.current) {
      return easeOut(clamp01(t / COMPACT_HEADING_OP_SPAN))
    }
    return easeOut(clamp01(t / 0.3))
  })
  const headingY = useTransform(headerReveal, (t) => {
    if (compactIntroRef.current) {
      return (1 - easeOut(clamp01(t / COMPACT_HEADING_OP_SPAN))) * headingTravelRef.current
    }
    return (1 - easeOut(clamp01(t / 0.3))) * headingTravelRef.current
  })
  const headingBlur = useTransform(headerReveal, (t) => {
    const b = (1 - easeOut(clamp01(t / 0.3))) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  const leadOp = useTransform(headerReveal, (t) => {
    if (compactIntroRef.current) {
      return easeOut(clamp01((t - COMPACT_LEAD_DELAY) / COMPACT_LEAD_OP_SPAN))
    }
    return easeOut(clamp01((t - 0.06) / 0.28))
  })
  const leadY = useTransform(headerReveal, (t) => {
    if (compactIntroRef.current) {
      return (
        (1 - easeOut(clamp01((t - COMPACT_LEAD_DELAY) / COMPACT_LEAD_OP_SPAN))) *
        leadTravelRef.current
      )
    }
    return (1 - easeOut(clamp01((t - 0.06) / 0.28))) * leadTravelRef.current
  })
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
      data-features-handoff={isCompactViewport ? 'document-flow' : 'desktop'}
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
                key={`${feature.id}-${isCompactViewport ? 'compact' : 'desktop'}`}
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
}) {
  const local = useTransform(reveal, (t) => easeOut(clamp01((t - start) / (end - start))))
  const opacity = useTransform(local, (v) => v)
  const y = useTransform(local, (v) => (1 - v) * 28)
  const blur = useTransform(local, (v) => {
    const b = (1 - v) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  const compactMotion = compact && !reduced
  const viewport = compactMotion ? COMPACT_CARD_REVEAL.viewport : undefined

  return (
    <motion.li
      className={styles.module}
      data-feature={id}
      data-lv2-feature-module=""
      data-feature-hover-surface="module"
      data-col-span={colSpan}
      data-feature-reveal={compactMotion ? 'viewport' : 'atlas'}
      data-feature-card-index={cardIndex}
      data-feature-reveal-duration={compactMotion ? String(COMPACT_CARD_REVEAL.transition.duration) : undefined}
      /* Compact: never bind atlas blur MotionValues — leftover filter:blur(3px) softens cards. */
      style={
        compactMotion
          ? { filter: 'none' }
          : compact && reduced
            ? { opacity: 1, y: 0, scale: 1, filter: 'none' }
            : { opacity, y, filter: blur }
      }
      initial={compactMotion ? { ...COMPACT_CARD_REVEAL.initial } : false}
      whileInView={compactMotion ? { ...COMPACT_CARD_REVEAL.animate } : undefined}
      viewport={viewport}
      transition={compactMotion ? { ...COMPACT_CARD_REVEAL.transition } : undefined}
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
