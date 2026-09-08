/**
 * Compact narrative CSS scroll-timeline range helpers — Iteration 3D.
 *
 * Absolute document scrollY ranges drive `animation-timeline: scroll()` so
 * incoming travel px === scroll range px (ratio 1.0). Ranges are measured on
 * layout/resize only — never on every scroll frame.
 */

import {
  COMPACT_NARRATIVE_OUTGOING_FADE_DONE,
  COMPACT_NARRATIVE_OUTGOING_RATIO,
  COMPACT_NARRATIVE_STATEMENT_COUNT,
  compactNarrativeSlotOffsets,
  type CompactNarrativeGeometry,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'

export type CompactNarrativeScrollRanges = {
  /** Absolute scrollY where statement i incoming starts. */
  inStart: number[]
  /** Absolute scrollY where statement i reaches y=0. */
  inEnd: number[]
  /** Absolute scrollY where statement i outgoing starts (next arrives). */
  outStart: number[]
  /** Absolute scrollY where statement i outgoing completes. */
  outEnd: number[]
}

/** Feature-detect CSS scroll-driven animations (no UA sniffing). */
export function supportsCssScrollTimeline(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return false
  }
  return (
    CSS.supports('animation-timeline: scroll()') ||
    CSS.supports('animation-timeline', 'scroll()')
  )
}

/**
 * Pin scrollY: document scroll position when narrative track top == navH
 * (sticky just pinned / scrub = 0).
 */
export function compactNarrativePinScrollY(
  trackDocumentTop: number,
  navH: number,
): number {
  return trackDocumentTop - navH
}

/**
 * Build absolute scroll ranges for CSS animation-range from geometry + pin.
 * pinScrollY = scrollY at scrub 0.
 */
export function compactNarrativeCssScrollRanges(
  g: CompactNarrativeGeometry,
  pinScrollY: number,
): CompactNarrativeScrollRanges {
  const slots = compactNarrativeSlotOffsets(g)
  const inStart: number[] = []
  const inEnd: number[] = []
  const outStart: number[] = []
  const outEnd: number[] = []

  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    inStart[i] = pinScrollY + slots.arriveStart[i]!
    inEnd[i] = pinScrollY + slots.arriveEnd[i]!
    if (i + 1 < COMPACT_NARRATIVE_STATEMENT_COUNT) {
      outStart[i] = pinScrollY + slots.arriveStart[i + 1]!
      outEnd[i] = pinScrollY + slots.arriveEnd[i + 1]!
    } else {
      /* Last statement: no outgoing — dummy equal range (animation unused). */
      outStart[i] = inEnd[i]!
      outEnd[i] = inEnd[i]!
    }
  }

  return { inStart, inEnd, outStart, outEnd }
}

/** Incoming scroll span must equal travelPx for ratio 1.0. */
export function compactNarrativeCssIncomingSpanPx(
  ranges: CompactNarrativeScrollRanges,
  index: number,
): number {
  return ranges.inEnd[index]! - ranges.inStart[index]!
}

export function compactNarrativeOutgoingTravelPx(travelPx: number): number {
  return Math.round(travelPx * COMPACT_NARRATIVE_OUTGOING_RATIO)
}

export function compactNarrativeOutgoingFadeProgress(): number {
  return COMPACT_NARRATIVE_OUTGOING_FADE_DONE
}
