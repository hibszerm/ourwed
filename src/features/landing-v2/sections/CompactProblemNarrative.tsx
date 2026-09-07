import { useEffect, useLayoutEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useTheaterScrollGate } from '@/features/landing-v2/motion/useTheaterScrollGate'
import {
  clearPublishedScene07HandoffT,
  publishScene07HandoffT,
} from '@/features/landing-v2/product-story/scene07HandoffClock'
import {
  COMPACT_NARRATIVE_COVER_HOLD_SVH,
  COMPACT_NARRATIVE_STATEMENTS,
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  activeStatementIndicesAtScroll,
  compactNarrativeCoverHandoffT,
  compactNarrativeGeometry,
  compactNarrativeSlotOffsets,
  statementVisualAtScroll,
  type CompactNarrativeGeometry,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'
import { isProblemStoryMutedLine } from '@/features/landing-v2/sections/problemStoryCopy'
import styles from './CompactProblemNarrative.module.css'

/**
 * Compact Problem Story — Iteration 3C.
 *
 * - Real spacer scroll slots: travelPx scroll ⇒ travelPx translate (ratio 1.0)
 * - Spatial handoff: outgoing fades/drifts before occupancy overlap
 * - Direct DOM transform/opacity (no Framer MotionValue travel)
 * - Black exit: sticky unpin → native document scroll (Founder cover principle)
 * - CSS scroll-timeline NOT used as SoT (sticky + dual-layer handoff); see tests
 */
export function CompactProblemNarrative() {
  const reduced = Boolean(useReducedMotion())
  const trackRef = useRef<HTMLElement | null>(null)
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const spacerRef = useRef<HTMLDivElement | null>(null)
  const statementRefs = useRef<Array<HTMLDivElement | null>>([])
  const geomRef = useRef<CompactNarrativeGeometry | null>(null)
  const { activeRef, onBecameActiveRef } = useTheaterScrollGate(
    trackRef,
    !reduced,
  )

  useLayoutEffect(() => {
    if (reduced) return
    const track = trackRef.current
    const spacer = spacerRef.current
    if (!track || !spacer) return

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
      spacer.style.height = `${slots.scrubBudget}px`
    }

    applyGeometry()
    const ro = new ResizeObserver(applyGeometry)
    ro.observe(track)
    window.addEventListener('resize', applyGeometry)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', applyGeometry)
    }
  }, [reduced])

  useEffect(() => {
    if (reduced) {
      publishScene07HandoffT(1)
      return () => clearPublishedScene07HandoffT()
    }

    let raf = 0
    const measure = () => {
      const track = trackRef.current
      const sticky = stickyRef.current
      const g = geomRef.current
      if (!track || !sticky || !g) return

      const navH = g.navH
      const trackTop = track.getBoundingClientRect().top
      /*
       * Scroll into scrub: how far past sticky pin we've traveled through spacers.
       * When trackTop == navH, scrub = 0. Each 1px track moves up → +1px scrub.
       */
      const scrollIntoScrub = Math.max(0, navH - trackTop)
      const slots = compactNarrativeSlotOffsets(g)
      const scrubClamped = Math.min(slots.scrubBudget, scrollIntoScrub)

      let activeCount = 0
      for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
        const el = statementRefs.current[i]
        if (!el) continue
        const vis = statementVisualAtScroll(scrubClamped, i, g)
        /* Paint from visual.active directly — do not gate on a capped index set. */
        const isActive = vis.active
        if (isActive) activeCount += 1
        el.setAttribute('data-narrative-active', isActive ? 'true' : 'false')
        if (!isActive) {
          el.style.opacity = '0'
          el.style.transform = 'translate3d(0, 0, 0)'
          continue
        }
        el.style.opacity = String(vis.opacity)
        el.style.transform = `translate3d(0, ${vis.y}px, 0)`
      }

      sticky.setAttribute('data-narrative-active-count', String(activeCount))
      sticky.setAttribute(
        'data-narrative-active-ids',
        activeStatementIndicesAtScroll(scrubClamped, g).join(','),
      )

      /*
       * Cover handoff: sticky unpin geometry — browser moves black 1:1.
       * No translateY curtain. handoffT drives Product ownership/autoplay only.
       */
      const stickyTop = sticky.getBoundingClientRect().top
      const handoffT = compactNarrativeCoverHandoffT(
        stickyTop,
        navH,
        g.stickyH,
      )
      publishScene07HandoffT(handoffT)
      sticky.setAttribute('data-narrative-cover-handoff', handoffT.toFixed(3))
    }

    const onScroll = () => {
      if (!activeRef.current) {
        const sticky = stickyRef.current
        const g = geomRef.current
        if (!sticky || !g) return
        const handoff = compactNarrativeCoverHandoffT(
          sticky.getBoundingClientRect().top,
          g.navH,
          g.stickyH,
        )
        if (handoff <= 0.001) return
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
      clearPublishedScene07HandoffT()
    }
  }, [reduced, activeRef, onBecameActiveRef])

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
              data-narrative-active="false"
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

      {/* Physical scrub runway — height = Σ(travel+hold); ratio 1.0 */}
      <div
        ref={spacerRef}
        className={styles.scrubSpacers}
        data-narrative-scrub-spacers=""
        aria-hidden
      />

      {/* Founder-like cover hold — sticky still pins; then unpins 1:1 */}
      <div
        className={styles.coverHold}
        data-narrative-cover-hold=""
        aria-hidden
      />
    </section>
  )
}
