import { useEffect, useRef, useState } from 'react'
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

const MODULES = ATLAS_MODULES satisfies typeof FEATURE_CARDS

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

const COMPACT_CARD_REVEAL = {
  initial: { opacity: 0, y: 22, scale: 0.995, filter: 'none' as const },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'none' as const },
  transition: { duration: 0.82, ease: COMPACT_EASE },
  viewport: { once: true as const, amount: 0.05, margin: '0px 0px -22% 0px' },
} as const

const HEADER_OFFSET_DESKTOP: ['start 0.92', 'start 0.5'] = ['start 0.92', 'start 0.5']

/** One-shot mobile demo — IO band near readable center; never thrash. */
const FEATURE_DEMO_VIEWPORT = {
  threshold: [0.55, 0.65],
  rootMargin: '0px 0px -12% 0px',
} as const

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function easeOut(t: number) {
  const x = clamp01(t)
  return 1 - (1 - x) ** 3
}

/**
 * Landing V2 — OurWed Product Atlas.
 * Desktop: scroll reveal + CSS :hover (hover-capable pointers only).
 * Compact: no useScroll; one-shot viewport demos derived from desktop hover.
 */
export function LandingV2FeaturesGrid() {
  const isCompactViewport = useLandingCompactViewport()
  if (isCompactViewport) {
    return <FeaturesGridCompact />
  }
  return <FeaturesGridDesktop />
}

function FeaturesGridCompact() {
  const reduced = Boolean(useReducedMotion())

  return (
    <section
      className={styles.section}
      data-testid="lv2-features-grid"
      data-lv2-features=""
      data-features-layout="compact"
      data-features-handoff="document-flow"
      data-features-scroll-engine="none"
      aria-labelledby="lv2-features-heading"
    >
      <div className={styles.inner}>
        <div className={styles.revealAnchor} data-lv2-features-reveal="">
          <header className={styles.header} data-features-intro="">
            <motion.h2
              id="lv2-features-heading"
              className={styles.heading}
              data-features-heading=""
              data-features-intro-motion="viewport"
              initial={reduced ? false : { opacity: 0, y: 12 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4, margin: '0px 0px -18% 0px' }}
              transition={{ duration: 0.55, ease: COMPACT_EASE }}
            >
              Kilka funkcji, które ułatwią Ci pracę
            </motion.h2>
            <motion.p
              className={styles.lead}
              data-features-lead=""
              data-features-intro-motion="viewport"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35, margin: '0px 0px -18% 0px' }}
              transition={{ duration: 0.55, ease: COMPACT_EASE, delay: 0.06 }}
            >
              Wszystko, czego potrzebujesz do prowadzenia zleceń — w jednym miejscu.
            </motion.p>
          </header>
        </div>

        <ul className={styles.atlas} data-lv2-features-atlas="">
          {MODULES.map((feature, index) => {
            const Scene = SCENES[feature.id]
            return (
              <CompactAtlasModule
                key={feature.id}
                id={feature.id}
                title={feature.title}
                description={feature.description}
                colSpan={feature.colSpan}
                Scene={Scene}
                reduced={reduced}
                cardIndex={index}
              />
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function CompactAtlasModule({
  id,
  title,
  description,
  colSpan,
  Scene,
  reduced,
  cardIndex,
}: {
  id: FeatureId
  title: string
  description: string
  colSpan: number
  Scene: (typeof SCENES)[FeatureId]
  reduced: boolean
  cardIndex: number
}) {
  const liRef = useRef<HTMLLIElement | null>(null)
  const [demo, setDemo] = useState<'idle' | 'done'>(reduced ? 'done' : 'idle')
  const demonstratedRef = useRef(reduced)

  useEffect(() => {
    if (reduced || demonstratedRef.current) return
    const el = liRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (demonstratedRef.current) return
        const ratio = entry?.intersectionRatio ?? 0
        if (ratio >= 0.55) {
          demonstratedRef.current = true
          setDemo('done')
          io.disconnect()
        }
      },
      {
        root: null,
        rootMargin: FEATURE_DEMO_VIEWPORT.rootMargin,
        threshold: [...FEATURE_DEMO_VIEWPORT.threshold],
      },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  return (
    <motion.li
      ref={liRef}
      className={styles.module}
      data-feature={id}
      data-lv2-feature-module=""
      data-feature-hover-surface="module"
      data-col-span={colSpan}
      data-feature-reveal="viewport"
      data-feature-card-index={cardIndex}
      data-feature-demo={demo}
      data-feature-reveal-duration={String(COMPACT_CARD_REVEAL.transition.duration)}
      style={{ filter: 'none' }}
      initial={reduced ? false : { ...COMPACT_CARD_REVEAL.initial }}
      whileInView={reduced ? undefined : { ...COMPACT_CARD_REVEAL.animate }}
      viewport={reduced ? undefined : COMPACT_CARD_REVEAL.viewport}
      transition={COMPACT_CARD_REVEAL.transition}
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

function FeaturesGridDesktop() {
  const reduced = useReducedMotion()
  const sectionRef = useRef<HTMLElement | null>(null)
  const revealRef = useRef<HTMLDivElement | null>(null)
  const forced = useMotionValue(reduced ? 1 : 0)

  const { scrollYProgress } = useScroll({
    target: revealRef,
    offset: ['start 0.6', 'start 0.4'],
  })

  const { scrollYProgress: headerScrollYProgress } = useScroll({
    target: revealRef,
    offset: HEADER_OFFSET_DESKTOP,
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

  const headingOp = useTransform(headerReveal, (t) => easeOut(clamp01(t / 0.3)))
  const headingY = useTransform(
    headerReveal,
    (t) => (1 - easeOut(clamp01(t / 0.3))) * 28,
  )
  const headingBlur = useTransform(headerReveal, (t) => {
    const b = (1 - easeOut(clamp01(t / 0.3))) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })
  const leadOp = useTransform(headerReveal, (t) =>
    easeOut(clamp01((t - 0.06) / 0.28)),
  )
  const leadY = useTransform(
    headerReveal,
    (t) => (1 - easeOut(clamp01((t - 0.06) / 0.28))) * 22,
  )
  const leadBlur = useTransform(headerReveal, (t) => {
    const b = (1 - easeOut(clamp01((t - 0.06) / 0.28))) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      data-testid="lv2-features-grid"
      data-lv2-features=""
      data-features-layout="desktop"
      data-features-handoff="desktop"
      aria-labelledby="lv2-features-heading"
    >
      <div className={styles.inner}>
        <div ref={revealRef} className={styles.revealAnchor} data-lv2-features-reveal="">
          <header className={styles.header} data-features-intro="">
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
          </header>
        </div>

        <ul className={styles.atlas} data-lv2-features-atlas="">
          {MODULES.map((feature, index) => {
            const Scene = SCENES[feature.id]
            const [start, end] = MODULE_WINDOWS[index] ?? [0.28, 0.58]
            return (
              <DesktopAtlasModule
                key={feature.id}
                id={feature.id}
                title={feature.title}
                description={feature.description}
                colSpan={feature.colSpan}
                reveal={reveal}
                start={start}
                end={end}
                Scene={Scene}
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

function DesktopAtlasModule({
  id,
  title,
  description,
  colSpan,
  reveal,
  start,
  end,
  Scene,
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
  reduced: boolean
  cardIndex: number
}) {
  const local = useTransform(reveal, (t) =>
    easeOut(clamp01((t - start) / (end - start))),
  )
  const opacity = useTransform(local, (v) => v)
  const y = useTransform(local, (v) => (1 - v) * 28)
  const blur = useTransform(local, (v) => {
    const b = (1 - v) * 3
    return b < 0.08 ? 'blur(0px)' : `blur(${b.toFixed(2)}px)`
  })

  return (
    <motion.li
      className={styles.module}
      data-feature={id}
      data-lv2-feature-module=""
      data-feature-hover-surface="module"
      data-col-span={colSpan}
      data-feature-reveal="atlas"
      data-feature-card-index={cardIndex}
      style={
        reduced
          ? { opacity: 1, y: 0, scale: 1, filter: 'none' }
          : { opacity, y, filter: blur }
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

/* Keep FEATURE_CARDS referenced for tests / catalog parity */
void FEATURE_CARDS
