import { useEffect, useRef } from 'react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { useTheaterScrollGate } from '@/features/landing-v2/motion/useTheaterScrollGate'
import {
  clearPublishedScene07HandoffT,
  publishScene07HandoffT,
} from '@/features/landing-v2/product-story/scene07HandoffClock'
import { stickyTrackProgress } from '@/features/landing-v2/product-story/productStoryProgress'
import {
  COMPACT_NARRATIVE_STATEMENTS,
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  activeStatementIndices,
  compactNarrativeHandoffT,
  compactNarrativeStageOpacity,
  statementVisualAt,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'
import { isProblemStoryMutedLine } from '@/features/landing-v2/sections/problemStoryCopy'
import styles from './CompactProblemNarrative.module.css'

/**
 * Compact Problem Story — Iteration 3B.
 *
 * Stable black sticky stage + stacked statements (translateY + opacity only).
 * Linear sticky progress (Founder cover-style finger coupling).
 * Publishes scene07HandoffMv during the clear tail for CompactProductReveal.
 */
export function CompactProblemNarrative() {
  const reduced = Boolean(useReducedMotion())
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const progress = useMotionValue(0)
  const { activeRef, onBecameActiveRef } = useTheaterScrollGate(
    trackRef,
    !reduced,
  )

  useEffect(() => {
    if (reduced) {
      publishScene07HandoffT(1)
      return () => clearPublishedScene07HandoffT()
    }

    let raf = 0
    const measure = () => {
      const el = trackRef.current
      if (!el) return
      const navH =
        parseFloat(getComputedStyle(el).getPropertyValue('--lv2-nav-h')) || 68
      const p = stickyTrackProgress(el, navH, window.innerHeight)
      progress.set(p)

      const handoffT = compactNarrativeHandoffT(p)
      publishScene07HandoffT(handoffT)

      const stage = stickyRef.current
      if (stage) {
        stage.style.opacity = String(compactNarrativeStageOpacity(handoffT))
        const active = activeStatementIndices(p)
        stage.setAttribute('data-narrative-active-count', String(active.length))
        stage.setAttribute(
          'data-narrative-active-ids',
          active.map((i) => COMPACT_NARRATIVE_STATEMENTS[i]?.id ?? '').join(','),
        )
      }
    }

    const onScroll = () => {
      if (!activeRef.current && progress.get() <= 0.001) return
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
      clearPublishedScene07HandoffT()
    }
  }, [reduced, activeRef, onBecameActiveRef, progress])

  if (reduced) {
    return (
      <section
        className={styles.track}
        data-testid="lv2-problem-story"
        data-landing-v2-problem=""
        data-problem-theater="static"
        data-problem-compact-narrative="true"
        aria-labelledby="lv2-problem-heading"
      >
        <h2 id="lv2-problem-heading" className={styles.visuallyHidden}>
          Problem i rozwiązanie
        </h2>
        <div className={styles.staticStack}>
          {COMPACT_NARRATIVE_STATEMENTS.map((stmt) => (
            <div
              key={stmt.id}
              className={styles.staticStatement}
              data-problem-scene={stmt.id}
            >
              <div className={styles.copy}>
                {stmt.lines.map((line, li) => (
                  <span
                    key={li}
                    className={[
                      styles.line,
                      isProblemStoryMutedLine(stmt.id, li)
                        ? styles.lineMuted
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section
      ref={trackRef}
      className={styles.track}
      data-testid="lv2-problem-story"
      data-landing-v2-problem=""
      data-problem-theater="stacked-narrative"
      data-problem-compact-narrative="true"
      aria-labelledby="lv2-problem-heading"
    >
      <h2 id="lv2-problem-heading" className={styles.visuallyHidden}>
        Problem i rozwiązanie
      </h2>

      <div
        ref={stickyRef}
        className={styles.sticky}
        data-problem-sticky-stage=""
        data-narrative-black="stable"
      >
        <div className={styles.readingZone} data-narrative-reading-zone="">
          {COMPACT_NARRATIVE_STATEMENTS.map((stmt, index) => (
            <NarrativeStatement
              key={stmt.id}
              index={index}
              id={stmt.id}
              lines={stmt.lines}
              progress={progress}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function NarrativeStatement({
  index,
  id,
  lines,
  progress,
}: {
  index: number
  id: (typeof COMPACT_NARRATIVE_STATEMENTS)[number]['id']
  lines: readonly string[]
  progress: MotionValue<number>
}) {
  const opacity = useTransform(progress, (p) => {
    return statementVisualAt(p, index).opacity
  })
  const y = useTransform(progress, (p) => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 844
    const enterY = vh * 0.42
    return statementVisualAt(p, index).yUnit * enterY
  })
  const active = useTransform(progress, (p) => {
    return statementVisualAt(p, index).active ? 'true' : 'false'
  })

  /* Keep data-narrative-active in sync without React re-renders per frame. */
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    return active.on('change', (v) => {
      ref.current?.setAttribute('data-narrative-active', v)
    })
  }, [active])

  return (
    <motion.div
      ref={ref}
      className={styles.statement}
      data-problem-scene={id}
      data-narrative-statement={index}
      data-narrative-active="false"
      style={{ opacity, y }}
    >
      <div className={styles.copy}>
        {lines.map((line, li) => (
          <span
            key={li}
            className={[
              styles.line,
              isProblemStoryMutedLine(id, li) ? styles.lineMuted : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {line}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

void COMPACT_NARRATIVE_STATEMENT_COUNT
