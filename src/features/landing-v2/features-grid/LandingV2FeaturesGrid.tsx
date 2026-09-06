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
 * Compact: vertical editorial stack; each card reveals via whileInView (not one parent clock).
 */
export function LandingV2FeaturesGrid() {
  const reduced = useReducedMotion()
  const isCompactViewport = useLandingCompactViewport()
  const sectionRef = useRef<HTMLElement | null>(null)
  const revealRef = useRef<HTMLDivElement | null>(null)
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
   * Headline / lead only — earlier entry so the next chapter appears while the
   * Workflow Explorer is still leaving (no long beige dead zone).
   * Does not drive atlas module motion.
   */
  const { scrollYProgress: headerScrollYProgress } = useScroll({
    target: revealRef,
    offset: ['start 0.92', 'start 0.5'],
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

  const headingTravel = isCompactViewport ? 16 : 28
  const leadTravel = isCompactViewport ? 10 : 22

  const headingOp = useTransform(headerReveal, (t) => easeOut(clamp01(t / 0.3)))
  const headingY = useTransform(
    headerReveal,
    (t) => (1 - easeOut(clamp01(t / 0.3))) * headingTravel,
  )
  const headingBlur = useTransform(headerReveal, (t) => {
    const b = (1 - easeOut(clamp01(t / 0.3))) * (isCompactViewport ? 2 : 3)
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  const leadOp = useTransform(headerReveal, (t) => easeOut(clamp01((t - 0.06) / 0.28)))
  const leadY = useTransform(
    headerReveal,
    (t) => (1 - easeOut(clamp01((t - 0.06) / 0.28))) * leadTravel,
  )
  const leadBlur = useTransform(headerReveal, (t) => {
    const b = (1 - easeOut(clamp01((t - 0.06) / 0.28))) * (isCompactViewport ? 2 : 3)
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

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
          <header className={styles.header}>
            <motion.h2
              id="lv2-features-heading"
              className={styles.heading}
              style={{ opacity: headingOp, y: headingY, filter: headingBlur }}
            >
              Kilka funkcji, które ułatwią Ci pracę
            </motion.h2>
            <motion.p
              className={styles.lead}
              style={{ opacity: leadOp, y: leadY, filter: leadBlur }}
            >
              Wszystko, czego potrzebujesz do prowadzenia zleceń — w jednym miejscu.
            </motion.p>
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
}) {
  const local = useTransform(reveal, (t) => easeOut(clamp01((t - start) / (end - start))))
  const opacity = useTransform(local, (v) => v)
  const y = useTransform(local, (v) => (1 - v) * 28)
  const blur = useTransform(local, (v) => {
    const b = (1 - v) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  const compactMotion = compact && !reduced

  return (
    <motion.li
      className={styles.module}
      data-feature={id}
      data-lv2-feature-module=""
      data-col-span={colSpan}
      data-feature-reveal={compactMotion ? 'viewport' : 'atlas'}
      style={compactMotion ? undefined : { opacity, y, filter: blur }}
      initial={compactMotion ? { opacity: 0, y: 18 } : false}
      whileInView={compactMotion ? { opacity: 1, y: 0 } : undefined}
      viewport={
        compactMotion
          ? { once: true, amount: 0.22, margin: '0px 0px -10% 0px' }
          : undefined
      }
      transition={
        compactMotion
          ? { duration: 0.55, ease: COMPACT_EASE }
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
