/**
 * Compact narrative → Product handoff stability — Iteration 3C.3.
 *
 * BEFORE (85abae6):
 *   Product sticky paint gated by scene07HandoffMv → React state
 *   (`data-ps-theater-owned` toggled visibility / z-index / pointer-events /
 *   content-visibility). Fast iOS flicks jump hundreds of px between frames;
 *   ownership catch-up lagged behind native sticky scroll → black hitch.
 *   Product sticky also painted full-viewport `--lv2-hero-paper` beige.
 *
 * AFTER:
 *   Visual stacking is pure document geometry:
 *     Narrative sticky (z-10, black) covers Product until it unpins.
 *     Product sticky stays painted + transparent; no JS visibility latch.
 *   Product pin aligns with narrative unpin (~0 px dual-pin overlap).
 *   scene07HandoffMv may still gate autoplay only — never paint ownership.
 */

import {
  compactNarrativeCoverHandoffT,
  compactNarrativeGeometry,
  compactNarrativeSlotOffsets,
  type CompactNarrativeGeometry,
} from '@/features/landing-v2/sections/compactProblemNarrativeProgress'

/** Documented dual-pin overlap at the boundary after 3C.2 geometry (≈0). */
export const COMPACT_HANDOFF_DUAL_PIN_OVERLAP_PX = 0

export type CompactMajorStickyOwner = 'narrative' | 'product' | 'none'

/**
 * Which major sticky owns the reading viewport for a scroll-into-narrative px.
 * Product track pins as narrative scrub ends (coverHold = 0).
 */
export function compactMajorStickyOwnerAt(
  scrollIntoNarrativePx: number,
  g: CompactNarrativeGeometry,
): CompactMajorStickyOwner {
  const slots = compactNarrativeSlotOffsets(g)
  const scrub = slots.scrubBudget
  if (scrollIntoNarrativePx < scrub - 0.5) return 'narrative'
  /* After scrub: narrative unpins; Product owns while within its sticky travel.
   * Product sticky travel ≈ stickyH before Lifecycle — treat as product until
   * scroll is well past stickyH past the boundary (exit). */
  const past = scrollIntoNarrativePx - scrub
  if (past < g.stickyH - 0.5) return 'product'
  return 'none'
}

/** HandoffT from geometry at a scroll-into-narrative position (pure). */
export function compactHandoffTAtScroll(
  scrollIntoNarrativePx: number,
  g: CompactNarrativeGeometry,
): number {
  const slots = compactNarrativeSlotOffsets(g)
  const scrub = slots.scrubBudget
  /* While scrubbing, sticky remains pinned → handoff 0. */
  if (scrollIntoNarrativePx <= scrub) {
    return compactNarrativeCoverHandoffT(g.navH, g.navH, g.stickyH)
  }
  const unpinned = scrollIntoNarrativePx - scrub
  const stickyTop = g.navH - unpinned
  return compactNarrativeCoverHandoffT(stickyTop, g.navH, g.stickyH)
}

/** Boundary scroll (into narrative track) where black unpin begins. */
export function compactHandoffBoundaryScrollPx(
  g: CompactNarrativeGeometry = compactNarrativeGeometry(874, 68),
): number {
  return compactNarrativeSlotOffsets(g).scrubBudget
}

/**
 * Deterministic owner samples across a fast flick jump.
 * Same endpoints must not require intermediate frames.
 */
export function compactHandoffOwnerJump(
  fromScrollPx: number,
  toScrollPx: number,
  g: CompactNarrativeGeometry,
): {
  from: CompactMajorStickyOwner
  to: CompactMajorStickyOwner
} {
  return {
    from: compactMajorStickyOwnerAt(fromScrollPx, g),
    to: compactMajorStickyOwnerAt(toScrollPx, g),
  }
}

/** Reverse path returns to identical owner at P1. */
export function compactHandoffReverseDeterministic(
  p1: number,
  p2: number,
  p3: number,
  g: CompactNarrativeGeometry,
): boolean {
  const direct = compactMajorStickyOwnerAt(p1, g)
  const via = (() => {
    compactMajorStickyOwnerAt(p1, g)
    compactMajorStickyOwnerAt(p3, g)
    compactMajorStickyOwnerAt(p2, g)
    return compactMajorStickyOwnerAt(p1, g)
  })()
  const tDirect = compactHandoffTAtScroll(p1, g)
  const tVia = (() => {
    compactHandoffTAtScroll(p3, g)
    compactHandoffTAtScroll(p2, g)
    return compactHandoffTAtScroll(p1, g)
  })()
  return direct === via && Math.abs(tDirect - tVia) < 1e-12
}
