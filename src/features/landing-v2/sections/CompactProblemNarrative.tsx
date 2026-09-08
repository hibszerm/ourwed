import { useLayoutEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  COMPACT_NARRATIVE_COVER_HOLD_SVH,
  COMPACT_NARRATIVE_STATEMENTS,
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  compactNarrativeGeometry,
  compactNarrativeSlotOffsets,
  statementVisualAtScroll,
  type CompactNarrativeGeometry,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'
import {
  compactNarrativeCssScrollRanges,
  compactNarrativeOutgoingTravelPx,
  compactNarrativePinScrollY,
  supportsCssScrollTimeline,
} from '@/features/landing-v2/sections/compactNarrativeCssScroll'
import { isProblemStoryMutedLine } from '@/features/landing-v2/sections/problemStoryCopy'
import styles from './CompactProblemNarrative.module.css'

/**
 * Compact Problem Story — Iteration 3D.
 *
 * Preferred: CSS `animation-timeline: scroll()` drives transform/opacity
 * (compositor-eligible). Real spacer geometry preserved (ratio 1.0).
 * Black exit: native sticky unpin — not a scroll timeline.
 * Fallback: deterministic JS scrub when scroll timelines unsupported.
 */
export function CompactProblemNarrative() {
  const reduced = Boolean(useReducedMotion())
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const spacerRef = useRef<HTMLDivElement | null>(null)
  const statementRefs = useRef<Array<HTMLDivElement | null>>([])
  const geomRef = useRef<CompactNarrativeGeometry | null>(null)
  const engineRef = useRef<'css-scroll' | 'js-scrub'>('js-scrub')

  useLayoutEffect(() => {
    if (reduced) return
    const track = trackRef.current
    const spacer = spacerRef.current
    if (!track || !spacer) return

    const cssOk = supportsCssScrollTimeline()
    engineRef.current = cssOk ? 'css-scroll' : 'js-scrub'
    track.setAttribute('data-narrative-engine', engineRef.current)

    const applyGeometry = () => {
      const navH =
        parseFloat(getComputedStyle(track).getPropertyValue('--lv2-nav-h')) ||
        68
      const g = compactNarrativeGeometry(window.innerHeight, navH)
      geomRef.current = g
      const slots = compactNarrativeSlotOffsets(g)
      track.style.setProperty(
        '--lv2-narrative-scrub-px',
        String(slots.scrubBudget),
      )
      track.style.setProperty(
        '--lv2-narrative-cover-svh',
        String(COMPACT_NARRATIVE_COVER_HOLD_SVH),
      )
      track.style.setProperty('--lv2-narrative-travel-px', String(g.travelPx))
      track.style.setProperty(
        '--lv2-narrative-outgoing-y',
        String(-compactNarrativeOutgoingTravelPx(g.travelPx)),
      )
      spacer.style.height = `${slots.scrubBudget}px`

      if (engineRef.current !== 'css-scroll') return

      const trackDocTop = track.getBoundingClientRect().top + window.scrollY
      const pinY = compactNarrativePinScrollY(trackDocTop, navH)
      const ranges = compactNarrativeCssScrollRanges(g, pinY)

      for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
        const el = statementRefs.current[i]
        if (!el) continue
        const hasIncoming = i >= 1
        const hasOutgoing = i < COMPACT_NARRATIVE_STATEMENT_COUNT - 1
        el.setAttribute('data-narrative-has-incoming', hasIncoming ? 'true' : 'false')
        el.setAttribute('data-narrative-has-outgoing', hasOutgoing ? 'true' : 'false')
        el.style.setProperty('--narr-in-start', `${ranges.inStart[i]}px`)
        el.style.setProperty('--narr-in-end', `${ranges.inEnd[i]}px`)
        el.style.setProperty('--narr-out-start', `${ranges.outStart[i]}px`)
        el.style.setProperty('--narr-out-end', `${ranges.outEnd[i]}px`)
      }
    }

    applyGeometry()
    const ro = new ResizeObserver(applyGeometry)
    ro.observe(track)
    window.addEventListener('resize', applyGeometry)

    /* ——— JS fallback scrub (only when CSS scroll timelines unavailable) ——— */
    let raf = 0
    let onScroll: (() => void) | null = null
    if (engineRef.current === 'js-scrub') {
      const measure = () => {
        const sticky = stickyRef.current
        const g = geomRef.current
        if (!sticky || !g) return
        const navH = g.navH
        const scrollIntoScrub = Math.max(
          0,
          navH - track.getBoundingClientRect().top,
        )
        const slots = compactNarrativeSlotOffsets(g)
        const scrubClamped = Math.min(slots.scrubBudget, scrollIntoScrub)
        for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
          const el = statementRefs.current[i]
          if (!el) continue
          const vis = statementVisualAtScroll(scrubClamped, i, g)
          el.setAttribute('data-narrative-active', vis.active ? 'true' : 'false')
          if (!vis.active) {
            el.style.opacity = '0'
            el.style.transform = 'translate3d(0, 0, 0)'
            continue
          }
          el.style.opacity = String(vis.opacity)
          el.style.transform = `translate3d(0, ${vis.y}px, 0)`
        }
      }
      onScroll = () => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(measure)
      }
      measure()
      window.addEventListener('scroll', onScroll, { passive: true })
    }

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', applyGeometry)
      if (onScroll) window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [reduced])

  if (reduced) {
    return (
      <section
        className={styles.track}
        data-testid="lv2-problem-story"
        data-landing-v2-problem=""
        data-problem-theater="static"
        data-problem-compact-narrative="true"
        data-problem-pixel-coupled="false"
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
      data-problem-theater="pixel-coupled"
      data-problem-compact-narrative="true"
      data-problem-pixel-coupled="true"
      data-narrative-cover="document"
      data-narrative-engine="css-scroll"
      aria-labelledby="lv2-problem-heading"
    >
      <h2 id="lv2-problem-heading" className={styles.visuallyHidden}>
        Problem i rozwiązanie
      </h2>

      <div
        ref={stickyRef}
        className={styles.sticky}
        data-problem-sticky-stage=""
        data-narrative-black="document-cover"
        data-narrative-sticky="single"
      >
        <div className={styles.readingZone} data-narrative-reading-zone="">
          {COMPACT_NARRATIVE_STATEMENTS.map((stmt, index) => (
            <div
              key={stmt.id}
              ref={(el) => {
                statementRefs.current[index] = el
              }}
              className={styles.statement}
              data-problem-scene={stmt.id}
              data-narrative-statement={index}
              data-narrative-has-incoming={index >= 1 ? 'true' : 'false'}
              data-narrative-has-outgoing={
                index < COMPACT_NARRATIVE_STATEMENT_COUNT - 1 ? 'true' : 'false'
              }
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
      </div>

      <div
        ref={spacerRef}
        className={styles.scrubSpacers}
        data-narrative-scrub-spacers=""
        aria-hidden
      />

      <div
        className={styles.coverHold}
        data-narrative-cover-hold=""
        aria-hidden
      />
    </section>
  )
}
