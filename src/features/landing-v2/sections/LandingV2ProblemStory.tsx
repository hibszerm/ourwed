import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import {
  clearPublishedScene07HandoffT,
  publishScene07HandoffT,
} from '@/features/landing-v2/product-story/scene07HandoffClock'
import {
  scene07PinActive,
} from '@/features/landing-v2/sections/scene07HeadlineContinuity'
import {
  PROBLEM_STORY_SCENES,
  PROBLEM_STORY_SCENE_CLASS,
  isProblemStoryMutedLine,
  type ProblemStorySceneId,
} from '@/features/landing-v2/sections/problemStoryCopy'
import { useLandingCompactViewport } from '@/features/landing-v2/motion/landingViewport'
import { useTheaterScrollGate } from '@/features/landing-v2/motion/useTheaterScrollGate'
import styles from './LandingV2ProblemStory.module.css'

/** Entrance / exit micro-motion — layout position stays fixed in CSS. */
const SCENE_ENTER_Y = 10
const SCENE_EXIT_Y = -8
const SCENE_ENTER_SCALE = 0.995
const SCENE_EXIT_SCALE = 1.002

/**
 * Compact portrait — opacity-only dissolve for normal beats.
 * Desktop's tiny +10px Y is fine on large stages; on phones any enter Y
 * stacks with sticky/early-fixed timing and reads as a slide from below.
 */
const SCENE_ENTER_Y_COMPACT = 0
const SCENE_EXIT_Y_COMPACT = 0

const SCENE07_EXIT_SCALE_DESKTOP = 2.15
/**
 * Compact portal scale — must meet Product reverse-Hero cover language
 * (desktop pairs 2.15↔2.15). Portrait needs a stronger push-through.
 */
const SCENE07_EXIT_SCALE_COMPACT = 3.2
const SCENE07_BLUR_MAX_DESKTOP = 25
const SCENE07_BLUR_MAX_COMPACT = 18

type SceneMotion = {
  opacity: MotionValue<number>
  y: MotionValue<number>
  scale: MotionValue<number>
}

type Scene01Motion = {
  /** Outer layer — positioning + exit only during entry/hold. */
  layer: SceneMotion
  /** Inner copy wrapper — entry fade / settle only. */
  entry: SceneMotion
}

/** Relative scroll weights — Scene 01 entrance already happens during Hero exit. */
const SCENE_WEIGHTS = [0.42, 0.7, 0.7, 0.8, 1.0, 0.9, 1.35] as const

/**
 * Scene 01 entry — tied to Hero exitProgress (read-only), NOT full blackout / sticky.
 * Hero exit maps master progress [0.70, 0.91] → exitProgress [0, 1].
 * Entry begins while the iPad is already nearly invisible (~exit 0.70 / blackout ~0.9).
 */
const SCENE01_EXIT_START = 0.7
/** Fixed text layer engages slightly before entry so absolute→fixed is not a visible pop. */
const SCENE01_FIXED_START = 0.68
/** Entry progress when Hero exitProgress hits 1.0 (iPad visually gone). */
const SCENE01_EXIT_PHASE_MAX = 0.55
/** Scroll px after exit completes to finish 0.55 → 1.0 (Scene-02-like settle). */
const SCENE01_TAIL_SCROLL_PX = 90

function easeOutCubic(t: number): number {
  return 1 - (1 - Math.max(0, Math.min(1, t))) ** 3
}

/** Map Hero master progress → exitProgress (mirrors LandingV2Hero, read-only). */
function heroExitProgress(heroP: number): number {
  return Math.min(1, Math.max(0, (heroP - 0.7) / 0.21))
}

/**
 * Continuous 0→1 entry from Hero exit visual state + short scroll tail.
 * Does NOT wait for blackout===1, heroP>=1, or stickyActive.
 */
function computeScene01EntryProgress(
  exitProgress: number,
  scrollY: number,
  tailOrigin: number | null,
): { progress: number; tailOrigin: number | null } {
  if (exitProgress < SCENE01_EXIT_START) {
    return { progress: 0, tailOrigin: null }
  }

  const exitNorm = Math.min(
    1,
    (exitProgress - SCENE01_EXIT_START) / (1 - SCENE01_EXIT_START),
  )
  let progress = exitNorm * SCENE01_EXIT_PHASE_MAX

  let nextTail = tailOrigin
  /* Exit complete at heroP≥0.91 — finish settle over a short scroll */
  if (exitProgress >= 1) {
    if (nextTail === null) nextTail = scrollY
    const tailNorm = Math.min(1, (scrollY - nextTail) / SCENE01_TAIL_SCROLL_PX)
    progress = Math.min(
      1,
      SCENE01_EXIT_PHASE_MAX +
        easeOutCubic(tailNorm) * (1 - SCENE01_EXIT_PHASE_MAX),
    )
  }

  return { progress, tailOrigin: nextTail }
}

function buildSceneRanges(weights: readonly number[]) {
  const sum = weights.reduce((a, b) => a + b, 0)
  const ranges: Array<{
    inStart: number
    inEnd: number
    holdStart: number
    holdEnd: number
    outStart: number
    outEnd: number
  }> = []
  let cursor = 0
  const usable = 0.998
  for (let i = 0; i < weights.length; i++) {
    const span = (weights[i]! / sum) * usable
    /*
     * Scene 01 already entered during Hero exit — keep only a short readable
     * hold, then exit quickly so Scene 02 does not require a long scroll.
     */
    const inFrac = i === 0 ? 0.05 : 0.2
    /*
     * Scene 07 (last): shorter readable hold so exit starts with earlier
     * text-scene cadence — entrance/inFrac unchanged. Scenes 02–06 keep 0.8.
     */
    const holdFrac = i === 0 ? 0.45 : i === weights.length - 1 ? 0.52 : 0.8
    const inStart = cursor
    const inEnd = cursor + span * inFrac
    const holdStart = inEnd
    const holdEnd = cursor + span * holdFrac
    const outStart = holdEnd
    const outEnd = cursor + span
    ranges.push({ inStart, inEnd, holdStart, holdEnd, outStart, outEnd })
    cursor = outEnd
  }
  return ranges
}

const SCENE_RANGES = buildSceneRanges(SCENE_WEIGHTS)

function useSceneMotion(
  progress: MotionValue<number>,
  range: (typeof SCENE_RANGES)[number],
  isLast: boolean,
  enterY = SCENE_ENTER_Y,
  enterScale = SCENE_ENTER_SCALE,
  exitY = SCENE_EXIT_Y,
  exitScale = SCENE_EXIT_SCALE,
): SceneMotion {
  const opacity = useTransform(
    progress,
    isLast
      ? [range.inStart, range.inEnd, 1]
      : [range.inStart, range.inEnd, range.outStart, range.outEnd],
    isLast ? [0, 1, 1] : [0, 1, 1, 0],
  )
  const y = useTransform(
    progress,
    isLast
      ? [range.inStart, range.inEnd, 1]
      : [range.inStart, range.inEnd, range.outStart, range.outEnd],
    isLast ? [enterY, 0, 0] : [enterY, 0, 0, exitY],
  )
  const scale = useTransform(
    progress,
    isLast
      ? [range.inStart, range.inEnd, 1]
      : [range.inStart, range.inEnd, range.outStart, range.outEnd],
    isLast ? [enterScale, 1, 1] : [enterScale, 1, 1, exitScale],
  )
  return { opacity, y, scale }
}

/** Scene 01 — inner entry wrapper + outer exit layer (Scene 02 motion language). */
function useScene01Motion(
  progress: MotionValue<number>,
  scene01Entry: MotionValue<number>,
  range: (typeof SCENE_RANGES)[number],
  enterY = SCENE_ENTER_Y,
  exitY = SCENE_EXIT_Y,
): Scene01Motion {
  /* Same enter envelope as Scene 02: linear opacity, settle, 0.995→1 */
  const entryOpacity = useTransform(scene01Entry, [0, 1], [0, 1])
  const entryY = useTransform(scene01Entry, [0, 1], [enterY, 0])
  const entryScale = useTransform(scene01Entry, [0, 1], [SCENE_ENTER_SCALE, 1])

  const layerOpacity = useTransform(
    progress,
    [range.outStart, range.outEnd],
    [1, 0],
  )
  const layerY = useTransform(progress, [range.outStart, range.outEnd], [0, exitY])
  const layerScale = useTransform(
    progress,
    [range.outStart, range.outEnd],
    [1, SCENE_EXIT_SCALE],
  )

  return {
    layer: { opacity: layerOpacity, y: layerY, scale: layerScale },
    entry: { opacity: entryOpacity, y: entryY, scale: entryScale },
  }
}

function sceneClass(sceneId: string) {
  return styles[PROBLEM_STORY_SCENE_CLASS[sceneId as keyof typeof PROBLEM_STORY_SCENE_CLASS]]
}

function SceneCopyBlock({
  sceneId,
  lines,
}: {
  sceneId: ProblemStorySceneId
  lines: readonly string[]
}) {
  return (
    <>
      {lines.map((line, li) => (
        <span
          key={li}
          data-visible-desktop-line=""
          className={[
            styles.line,
            isProblemStoryMutedLine(sceneId, li) ? styles.lineMuted : styles.linePrimary,
          ].join(' ')}
        >
          {line}
        </span>
      ))}
    </>
  )
}

function Scene05WideDesktopLine({ text }: { text: string }) {
  return (
    <div className={styles.scene05LineCenter}>
      <span
        data-scene05-actual-text=""
        className={[styles.linePrimary, styles.scene05ActualText].join(' ')}
      >
        {text}
      </span>
    </div>
  )
}

function SceneCopy({
  sceneId,
  mobileLines,
  desktopLines,
  desktopLinesCompact,
}: {
  sceneId: ProblemStorySceneId
  mobileLines: readonly string[]
  desktopLines: readonly string[]
  desktopLinesCompact?: readonly string[]
}) {
  return (
    <div className={styles.sceneCopy}>
      <div className={styles.lineDesktopWide}>
        {sceneId === '05' && desktopLines.length === 1 ? (
          <Scene05WideDesktopLine text={desktopLines[0]!} />
        ) : (
          <SceneCopyBlock sceneId={sceneId} lines={desktopLines} />
        )}
      </div>
      {desktopLinesCompact ? (
        <div className={styles.lineDesktopCompact}>
          <SceneCopyBlock sceneId={sceneId} lines={desktopLinesCompact} />
        </div>
      ) : null}
      {mobileLines.map((line, li) => (
        <span
          key={li}
          className={[
            styles.line,
            styles.lineMobile,
            isProblemStoryMutedLine(sceneId, li) ? styles.lineMuted : styles.linePrimary,
          ].join(' ')}
        >
          {line}
        </span>
      ))}
    </div>
  )
}

/**
 * Black typographic Problem Story — Scenes 01–07.
 * Sticky scroll theater on desktop and compact viewports.
 * Reduced-motion only: static stacked flow.
 */
export function LandingV2ProblemStory() {
  const trackRef = useRef<HTMLElement | null>(null)
  const scene01TailOrigin = useRef<number | null>(null)
  /** ScrollY when Scene 01 entry first reaches ~1 — story progress starts here (not at sticky). */
  const scene01SettleOrigin = useRef<number | null>(null)
  const isReducedMotion = Boolean(useReducedMotion())
  const isCompactViewport = useLandingCompactViewport()
  /**
   * Scene 07 text-only fixed/portal layer — structural (portal mount).
   * Engages BEFORE Scene 07 enter (opacity still 0) so the sticky→portal swap
   * never coincides with a visible frame. Same DOM owner through hold → blur exit.
   * Updated only at discrete threshold crossings.
   */
  const [scene07Pinned, setScene07Pinned] = useState(false)
  const progress = useMotionValue(0)
  const scene01Entry = useMotionValue(0)
  /**
   * Scene 07 exit camera — driven ONLY by Scene 07 cadence outStart→outEnd
   * via `--lv2-scene07-handoff`. Entrance/hold timing unchanged. No second headline.
   */
  const scene07Exit = useMotionValue(0)

  /* Theater runs on compact; only accessibility reduces to static. */
  const skipTheater = isReducedMotion
  const { activeRef, onBecameActiveRef } = useTheaterScrollGate(
    trackRef,
    !skipTheater,
  )

  const enterY = isCompactViewport ? SCENE_ENTER_Y_COMPACT : SCENE_ENTER_Y
  const exitY = isCompactViewport ? SCENE_EXIT_Y_COMPACT : SCENE_EXIT_Y
  const scene07ExitScaleTo = isCompactViewport
    ? SCENE07_EXIT_SCALE_COMPACT
    : SCENE07_EXIT_SCALE_DESKTOP
  /* Compact: restore intended Scene 07 exit blur (Iteration 1 zeroing had no iPhone gain). */
  const scene07BlurMax = isCompactViewport
    ? SCENE07_BLUR_MAX_COMPACT
    : SCENE07_BLUR_MAX_DESKTOP

  useEffect(() => {
    if (skipTheater) {
      progress.set(1)
      scene01Entry.set(1)
      publishScene07HandoffT(1)
      document.documentElement.style.setProperty('--lv2-ps-headline-exit', '1')
      return
    }

    const el = trackRef.current
    if (!el) return

    let raf = 0
    let lastScene01Fixed = false
    let lastEarlyFixed = false
    let lastScene07Pinned = false
    const measure = () => {
      const navH =
        parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h')) || 68
      const stickyStart = el.offsetTop - navH
      const stickyTravel = Math.max(
        1,
        el.offsetHeight - (window.innerHeight - navH),
      )
      const trackRect = el.getBoundingClientRect()
      const stickyActive = trackRect.top <= navH + 0.5
      const stickyStage = el.querySelector(
        '[data-problem-sticky-stage]',
      ) as HTMLElement | null
      const scene01Layer = el.querySelector(
        '[data-problem-scene="01"]',
      ) as HTMLElement | null

      /* Scene 01 text — continuous from Hero exitProgress (read-only visual handoff). */
      const heroEl = document.querySelector(
        '[data-testid="lv2-hero"]',
      ) as HTMLElement | null
      let entryProgress = 0
      if (heroEl) {
        const heroTotal = Math.max(1, heroEl.offsetHeight - window.innerHeight)
        const heroRect = heroEl.getBoundingClientRect()
        const heroP = Math.min(1, Math.max(0, -heroRect.top / heroTotal))
        const exitP = heroExitProgress(heroP)

        if (exitP < SCENE01_EXIT_START) {
          scene01TailOrigin.current = null
        }

        const computed = computeScene01EntryProgress(
          exitP,
          window.scrollY,
          scene01TailOrigin.current,
        )
        scene01TailOrigin.current = computed.tailOrigin
        entryProgress = computed.progress
        scene01Entry.set(entryProgress)

        /*
         * Fixed text-only presentation engages at Hero exit START (opacity still 0),
         * so the absolute→fixed swap never coincides with first visible frame.
         * Transparent — Hero blackPlate remains the black field.
         * DOM attribute only — no React rerender on scroll.
         */
        const nextFixed =
          exitP >= SCENE01_FIXED_START &&
          !stickyActive &&
          scene01SettleOrigin.current === null
        if (nextFixed !== lastScene01Fixed) {
          lastScene01Fixed = nextFixed
          scene01Layer?.setAttribute(
            'data-scene01-handoff-fixed',
            nextFixed ? 'true' : 'false',
          )
        }
      } else {
        scene01Entry.set(0)
        if (lastScene01Fixed) {
          lastScene01Fixed = false
          scene01Layer?.setAttribute('data-scene01-handoff-fixed', 'false')
        }
      }

      /*
       * Master story progress starts when Scene 01 has settled — not only when
       * sticky pins. That removes the long empty-hold scroll before Scene 02.
       */
      if (entryProgress >= 0.999 && scene01SettleOrigin.current === null) {
        scene01SettleOrigin.current = window.scrollY
      } else if (entryProgress < 0.55) {
        scene01SettleOrigin.current = null
      }

      const storyStart = scene01SettleOrigin.current ?? stickyStart
      const storyEnd = stickyStart + stickyTravel
      const storyTravel = Math.max(1, storyEnd - storyStart)
      /*
       * Pure spatial continuity: once scroll is past the Problem Story track end,
       * master progress stays at 1 so `--lv2-scene07-handoff` remains 1 while the
       * user is legitimately inside Product Story (no direction latch).
       */
      const pastProblemStory = window.scrollY >= storyEnd - 0.5
      const raw = pastProblemStory
        ? 1
        : scene01SettleOrigin.current !== null || stickyActive
          ? (window.scrollY - storyStart) / storyTravel
          : 0
      progress.set(Math.min(1, Math.max(0, raw)))

      /*
       * After Scene 01 has settled and before Problem Story sticky pins,
       * pin the whole stage as a transparent text layer over Hero black so
       * Scene 02+ can crossfade without waiting for sticky activation.
       */
      const nextEarly = scene01SettleOrigin.current !== null && !stickyActive
      if (nextEarly !== lastEarlyFixed) {
        lastEarlyFixed = nextEarly
        stickyStage?.setAttribute(
          'data-early-story-fixed',
          nextEarly ? 'true' : 'false',
        )
      }

      /*
       * ONE handoff clock — Scene 07 exit cadence only (outStart → outEnd).
       * Not Product sticky pin, not approach probes, not html data flags.
       */
      const s07Range = SCENE_RANGES[6]!
      const storyP = Math.min(1, Math.max(0, raw))
      const scene07HandoffT = Math.min(
        1,
        Math.max(
          0,
          (storyP - s07Range.outStart) /
            Math.max(0.0001, s07Range.outEnd - s07Range.outStart),
        ),
      )
      /* MotionValue + CSS — Product scale reads Mv (Hero-like), not getComputedStyle */
      publishScene07HandoffT(scene07HandoffT)
      /* Headline camera-through uses eased handoff */
      const exitT = easeOutCubic(scene07HandoffT)
      document.documentElement.style.setProperty(
        '--lv2-ps-headline-exit',
        exitT.toFixed(4),
      )
      scene07Exit.set(exitT)

      /*
       * Pin Scene 07 to the fixed/portal owner BEFORE enter (opacity ≈ 0).
       * NEVER flip ownership at handoffT>0 while the headline is still opaque —
       * that remount caused the Safari disappear→reappear flash.
       * Discrete React state only — structural portal mount.
       */
      const nextPinned = scene07PinActive(storyP)
      if (nextPinned !== lastScene07Pinned) {
        lastScene07Pinned = nextPinned
        setScene07Pinned(nextPinned)
      }
    }

    const onScroll = () => {
      if (!activeRef.current) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    const onResize = () => {
      scene01TailOrigin.current = null
      scene01SettleOrigin.current = null
      onScroll()
    }

    onBecameActiveRef.current = onScroll
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      onBecameActiveRef.current = null
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      clearPublishedScene07HandoffT()
      document.documentElement.style.removeProperty('--lv2-ps-headline-exit')
    }
  }, [skipTheater, progress, scene01Entry, scene07Exit, activeRef, onBecameActiveRef])

  useMotionValueEvent(progress, 'change', (v) => {
    const node = trackRef.current
    if (node) node.style.setProperty('--problem-progress', v.toFixed(4))
  })

  const s0 = useScene01Motion(
    progress,
    scene01Entry,
    SCENE_RANGES[0]!,
    enterY,
    exitY,
  )
  const s1 = useSceneMotion(
    progress,
    SCENE_RANGES[1]!,
    false,
    enterY,
    SCENE_ENTER_SCALE,
    exitY,
  )
  const s2 = useSceneMotion(
    progress,
    SCENE_RANGES[2]!,
    false,
    enterY,
    SCENE_ENTER_SCALE,
    exitY,
  )
  const s3 = useSceneMotion(
    progress,
    SCENE_RANGES[3]!,
    false,
    enterY,
    SCENE_ENTER_SCALE,
    exitY,
  )
  const s4 = useSceneMotion(
    progress,
    SCENE_RANGES[4]!,
    false,
    enterY,
    SCENE_ENTER_SCALE,
    exitY,
  )
  const s5 = useSceneMotion(
    progress,
    SCENE_RANGES[5]!,
    false,
    enterY,
    SCENE_ENTER_SCALE,
    exitY,
  )
  const s6Base = useSceneMotion(
    progress,
    SCENE_RANGES[6]!,
    true,
    enterY,
    SCENE_ENTER_SCALE,
    exitY,
  )
  /*
   * Camera-through typography: scale + fade on the stage layer;
   * blur is restored on a tightly bounded headline wrapper only
   * (not the full-viewport sceneLayer). Max blur adapted for compact.
   */
  const s6ExitOpacity = useTransform(scene07Exit, [0, 1], [1, 0])
  const s6ExitScale = useTransform(scene07Exit, [0, 1], [1, scene07ExitScaleTo])
  const s6ExitFilter = useTransform(scene07Exit, (t) => {
    const px = t * scene07BlurMax
    return px < 0.2 ? 'none' : `blur(${px.toFixed(1)}px)`
  })
  const s6: SceneMotion = {
    opacity: useTransform(
      [s6Base.opacity, s6ExitOpacity],
      ([base, exit]) => (base as number) * (exit as number),
    ),
    y: s6Base.y,
    scale: useTransform(
      [s6Base.scale, s6ExitScale],
      ([base, exit]) => (base as number) * (exit as number),
    ),
  }
  const scenesMotion: Array<SceneMotion | Scene01Motion | typeof s6> = [
    s0,
    s1,
    s2,
    s3,
    s4,
    s5,
    s6,
  ]

  return (
    <section
      ref={trackRef}
      className={styles.problemTrack}
      data-testid="lv2-problem-story"
      data-landing-v2-problem=""
      data-problem-theater={skipTheater ? 'static' : 'scroll'}
      data-problem-compact={isCompactViewport ? 'true' : 'false'}
      data-problem-reduced-motion={isReducedMotion ? 'true' : 'false'}
      aria-labelledby="lv2-problem-heading"
      style={{ ['--problem-progress' as string]: 0 }}
    >
      <h2 id="lv2-problem-heading" className={styles.visuallyHidden}>
        Fragmentacja jednego zlecenia
      </h2>

      {skipTheater ? (
        <div className={styles.staticStack}>
          {PROBLEM_STORY_SCENES.map((scene) => (
            <div
              key={scene.id}
              className={[styles.staticScene, sceneClass(scene.id)].join(' ')}
              data-problem-scene={scene.id}
            >
              <div className={styles.sceneCopy}>
                {scene.lines.map((line, li) => (
                  <span
                    key={li}
                    className={[
                      styles.line,
                      styles.lineMobile,
                      isProblemStoryMutedLine(scene.id, li)
                        ? styles.lineMuted
                        : styles.linePrimary,
                    ].join(' ')}
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={styles.stickyStage}
          data-problem-sticky-stage=""
          data-early-story-fixed="false"
        >
          <div className={styles.stageInner}>
            {PROBLEM_STORY_SCENES.map((scene, i) => {
              const m = scenesMotion[i]!
              if (scene.id === '01' && 'entry' in m) {
                const scene01 = m as Scene01Motion
                return (
                  <motion.div
                    key={scene.id}
                    className={[styles.sceneLayer, sceneClass(scene.id)].join(' ')}
                    data-problem-scene={scene.id}
                    data-scene01-handoff-fixed="false"
                    style={{
                      opacity: scene01.layer.opacity,
                      y: scene01.layer.y,
                      scale: scene01.layer.scale,
                    }}
                  >
                    <motion.div
                      className={styles.scene01EntryWrap}
                      style={{
                        opacity: scene01.entry.opacity,
                        y: scene01.entry.y,
                        scale: scene01.entry.scale,
                      }}
                    >
                      <SceneCopy
                        sceneId={scene.id}
                        mobileLines={scene.lines}
                        desktopLines={scene.desktopLines}
                        desktopLinesCompact={
                          'desktopLinesCompact' in scene
                            ? (scene.desktopLinesCompact as
                                | readonly string[]
                                | undefined)
                            : undefined
                        }
                      />
                    </motion.div>
                  </motion.div>
                )
              }

              const motionScene = m as SceneMotion
              const isScene07 = scene.id === '07'
              const sceneCopy = (
                <SceneCopy
                  sceneId={scene.id}
                  mobileLines={scene.lines}
                  desktopLines={scene.desktopLines}
                  desktopLinesCompact={
                    'desktopLinesCompact' in scene
                      ? (scene.desktopLinesCompact as
                          | readonly string[]
                          | undefined)
                      : undefined
                  }
                />
              )
              const sceneBody = isScene07 ? (
                <motion.div
                  className={styles.scene07HeadlineBlur}
                  data-scene07-headline-blur=""
                  style={{ filter: s6ExitFilter }}
                >
                  {sceneCopy}
                </motion.div>
              ) : (
                sceneCopy
              )

              /*
               * Scene 07: ONE visual owner. When pinned, portal + fixed geometry,
               * but MotionValues stay the continuous drivers (no CSS-var style swap).
               */
              if (isScene07 && scene07Pinned && typeof document !== 'undefined') {
                return (
                  <div key={scene.id}>
                    {/* Empty sticky slot — live headline is portaled above Product Story. */}
                    <div
                      className={[styles.sceneLayer, sceneClass(scene.id)].join(' ')}
                      data-problem-scene-slot={scene.id}
                      data-scene07-slot="true"
                      aria-hidden
                      style={{ opacity: 0, visibility: 'hidden' }}
                    />
                    {createPortal(
                      <motion.div
                        className={[
                          styles.sceneLayer,
                          sceneClass(scene.id),
                          styles.scene07ExitFixed,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        data-problem-scene={scene.id}
                        data-scene07-portaled="true"
                        style={{
                          opacity: motionScene.opacity,
                          y: motionScene.y,
                          scale: motionScene.scale,
                        }}
                      >
                        {sceneBody}
                      </motion.div>,
                      document.body,
                    )}
                  </div>
                )
              }

              return (
                <motion.div
                  key={scene.id}
                  className={[
                    styles.sceneLayer,
                    sceneClass(scene.id),
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-problem-scene={scene.id}
                  style={{
                    opacity: motionScene.opacity,
                    y: motionScene.y,
                    scale: motionScene.scale,
                  }}
                >
                  {sceneBody}
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
