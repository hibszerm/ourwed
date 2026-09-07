/**
 * Compact Problem Story — Iteration 3C pixel-coupled narrative geometry.
 *
 * BEFORE (3B) on ~874× CSS viewport:
 *   incoming travel ≈ 367px over ≈ 97px scroll → ratio ≈ 3.80 (FAILED)
 *   outgoing stayed opacity 1 until incoming was ~31px from center (COLLISION)
 *   black exit = sticky opacity fade (NOT document 1:1)
 *
 * AFTER (3C):
 *   incoming travelPx / scrollPx = 1.0 (hard invariant)
 *   outgoing fades + drifts before occupancy overlap
 *   black cover exit = sticky unpin / normal document scroll (Founder pattern)
 *
 * CSS scroll-timeline NOT used as the motion source of truth: sticky reading
 * viewport + dual-layer spatial handoff + Founder document cover are expressed
 * more reliably as scroll-position → translate3d/opacity with ratio 1.0.
 * Safari 26+ supports animation-timeline, but we avoid a second parallel engine.
 */

import { PROBLEM_STORY_SCENES } from '@/features/landing-v2/sections/problemStoryCopy'

export const COMPACT_NARRATIVE_STATEMENTS = PROBLEM_STORY_SCENES.map((s) => ({
  id: s.id,
  lines: s.lines,
}))

export const COMPACT_NARRATIVE_STATEMENT_COUNT =
  COMPACT_NARRATIVE_STATEMENTS.length

/** Incoming main travel motion ratio (element_px / scroll_px). */
export const COMPACT_NARRATIVE_INCOMING_RATIO = 1

/** Outgoing drifts upward slower so layers separate spatially. */
export const COMPACT_NARRATIVE_OUTGOING_RATIO = 0.38

/**
 * Outgoing opacity reaches ≤0.15 by this fraction of incoming travel.
 * Ensures collision invariant before texts occupy the same zone.
 */
export const COMPACT_NARRATIVE_OUTGOING_FADE_DONE = 0.62

/** Modeled primary text occupancy height (px) for collision tests. */
export const COMPACT_NARRATIVE_TEXT_OCCUPANCY_PX = 140

/** Cover hold after last statement — Founder-like 1:1 document reveal runway (svh). */
export const COMPACT_NARRATIVE_COVER_HOLD_SVH = 100

export type CompactNarrativeGeometry = {
  navH: number
  viewportH: number
  stickyH: number
  /** Incoming start offset below reading position (px). */
  travelPx: number
  /** Calm hold after arrival (px) — separate from travel. */
  holdPx: number
  /** First statement opacity settle scroll (px). */
  introPx: number
  /** Estimated statement text block height for collision model. */
  textOccupancyPx: number
}

export type CompactStatementVisual = {
  opacity: number
  /** translateY in CSS px (0 = reading position). */
  y: number
  active: boolean
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

/**
 * Derive physical geometry from viewport — travel distance IS the scroll slot.
 * travelPx ≈ 42% of sticky height → start below fold, land slightly above center.
 */
export function compactNarrativeGeometry(
  viewportH: number,
  navH = 68,
): CompactNarrativeGeometry {
  const stickyH = Math.max(320, viewportH - navH)
  const travelPx = Math.round(stickyH * 0.42)
  const holdPx = Math.round(stickyH * 0.22)
  const introPx = Math.round(Math.min(56, stickyH * 0.07))
  return {
    navH,
    viewportH,
    stickyH,
    travelPx,
    holdPx,
    introPx,
    textOccupancyPx: COMPACT_NARRATIVE_TEXT_OCCUPANCY_PX,
  }
}

/** Scroll budget before statement 0 is fully settled (intro only). */
export function compactNarrativeIntroScroll(g: CompactNarrativeGeometry): number {
  return g.introPx
}

/**
 * Scroll distance for statement index handoff (index ≥ 1 arrives).
 * = travel (1:1) + hold. Never squeeze travel into a shorter segment.
 */
export function compactNarrativeTransitionScroll(
  g: CompactNarrativeGeometry,
): number {
  return g.travelPx + g.holdPx
}

/**
 * Absolute scroll offsets (px into sticky travel) for each statement's arrival window.
 * Statement 0: [0, intro]
 * Statement i (i≥1): arrives during travel of its transition slot.
 */
export function compactNarrativeSlotOffsets(g: CompactNarrativeGeometry): {
  /** ScrollY-into-track where statement i begins arriving (or intro for 0). */
  arriveStart: number[]
  /** Scroll where statement i reaches reading position. */
  arriveEnd: number[]
  /** Scroll where statement i's hold ends / next begins. */
  holdEnd: number[]
  /** Total sticky scrub budget before cover hold. */
  scrubBudget: number
} {
  const arriveStart: number[] = []
  const arriveEnd: number[] = []
  const holdEnd: number[] = []
  let cursor = 0

  arriveStart[0] = 0
  arriveEnd[0] = g.introPx
  holdEnd[0] = g.introPx + g.holdPx
  cursor = holdEnd[0]

  for (let i = 1; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    arriveStart[i] = cursor
    arriveEnd[i] = cursor + g.travelPx
    holdEnd[i] = arriveEnd[i] + g.holdPx
    cursor = holdEnd[i]
  }

  return {
    arriveStart,
    arriveEnd,
    holdEnd,
    scrubBudget: cursor,
  }
}

/** Total track height extras: cover hold in CSS px for a given svh size. */
export function compactNarrativeCoverHoldPx(
  viewportH: number,
  coverSvh = COMPACT_NARRATIVE_COVER_HOLD_SVH,
): number {
  return Math.round((coverSvh / 100) * viewportH)
}

/**
 * Pixel-coupled statement visual from absolute scroll-into-scrub (px).
 * scrollIntoScrub is how far we've scrolled through the sticky scrub budget.
 */
export function statementVisualAtScroll(
  scrollIntoScrub: number,
  index: number,
  g: CompactNarrativeGeometry,
): CompactStatementVisual {
  const slots = compactNarrativeSlotOffsets(g)
  const s = Math.max(0, scrollIntoScrub)

  /* ——— Statement 0: gentle opacity settle, tiny Y ——— */
  if (index === 0) {
    if (s < slots.arriveStart[0]!) {
      return { opacity: 0, y: Math.round(g.travelPx * 0.08), active: false }
    }
    if (s < slots.arriveEnd[0]!) {
      const t = (s - slots.arriveStart[0]!) / Math.max(1, g.introPx)
      return {
        opacity: clamp01(t),
        y: Math.round((1 - t) * g.travelPx * 0.08),
        active: true,
      }
    }
    /* Hold — until next transition starts driving outgoing */
    if (s < slots.arriveStart[1]!) {
      return { opacity: 1, y: 0, active: true }
    }
    /* Outgoing during statement 1 arrival */
    return outgoingDuringIncoming(s, 1, g, slots)
  }

  /* ——— Statement i ≥ 1 ——— */
  const start = slots.arriveStart[index]!
  const end = slots.arriveEnd[index]!

  if (s < start) {
    return { opacity: 0, y: g.travelPx, active: false }
  }

  if (s < end) {
    const scrolled = s - start
    /* Pixel coupling: 1 scroll px → 1 translate px */
    const y = Math.max(0, g.travelPx - scrolled * COMPACT_NARRATIVE_INCOMING_RATIO)
    return {
      opacity: 1,
      y: Math.round(y),
      active: true,
    }
  }

  /* Arrived — hold until next starts */
  const nextStart =
    index + 1 < COMPACT_NARRATIVE_STATEMENT_COUNT
      ? slots.arriveStart[index + 1]!
      : slots.scrubBudget + 1

  if (s < nextStart) {
    return { opacity: 1, y: 0, active: true }
  }

  /* Outgoing while next arrives */
  if (index + 1 < COMPACT_NARRATIVE_STATEMENT_COUNT) {
    return outgoingDuringIncoming(s, index + 1, g, slots)
  }

  /* Last statement holds through scrub end (cover is document, not transform) */
  return { opacity: 1, y: 0, active: s <= slots.scrubBudget + 1 }
}

function outgoingDuringIncoming(
  s: number,
  incomingIndex: number,
  g: CompactNarrativeGeometry,
  slots: ReturnType<typeof compactNarrativeSlotOffsets>,
): CompactStatementVisual {
  const start = slots.arriveStart[incomingIndex]!
  const scrolled = Math.min(g.travelPx, Math.max(0, s - start))
  const travelT = scrolled / Math.max(1, g.travelPx)

  const y = Math.round(-scrolled * COMPACT_NARRATIVE_OUTGOING_RATIO)
  const fadeT = clamp01(travelT / COMPACT_NARRATIVE_OUTGOING_FADE_DONE)
  const opacity = clamp01(1 - fadeT)

  return {
    opacity,
    y,
    active: opacity > 0.01 || Math.abs(y) > 0.5,
  }
}

/**
 * Collision model: when incoming top enters outgoing occupancy zone,
 * outgoing opacity must be ≤ 0.15.
 *
 * Occupancy zone modeled as ±textOccupancyPx/2 around reading y=0.
 * Incoming top ≈ incoming.y - textOccupancyPx/2.
 * Overlap begins when incoming.y - textH/2 <= textH/2
 *   ⇒ incoming.y <= textOccupancyPx
 */
export function collisionInvariantHolds(
  g: CompactNarrativeGeometry,
  incomingIndex: number,
): { ok: boolean; atIncomingY: number; outgoingOpacity: number } {
  const slots = compactNarrativeSlotOffsets(g)
  const start = slots.arriveStart[incomingIndex]!
  /* First scroll position where incoming.y <= textOccupancyPx */
  const scrolledWhenEnterZone = Math.max(0, g.travelPx - g.textOccupancyPx)
  const s = start + scrolledWhenEnterZone
  const outgoing = statementVisualAtScroll(s, incomingIndex - 1, g)
  const incoming = statementVisualAtScroll(s, incomingIndex, g)
  return {
    ok: outgoing.opacity <= 0.15 + 1e-6,
    atIncomingY: incoming.y,
    outgoingOpacity: outgoing.opacity,
  }
}

/** Active pair indices (max 2). */
export function activeStatementIndicesAtScroll(
  scrollIntoScrub: number,
  g: CompactNarrativeGeometry,
): number[] {
  const out: number[] = []
  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    if (statementVisualAtScroll(scrollIntoScrub, i, g).active) out.push(i)
  }
  return out.slice(0, 2)
}

/**
 * Product handoff from sticky unpin geometry (Founder-like).
 * stickyTop == navH → 0 (still covering)
 * stickyTop == navH - stickyH → 1 (fully scrolled away)
 */
export function compactNarrativeCoverHandoffT(
  stickyTop: number,
  navH: number,
  stickyH: number,
): number {
  if (stickyTop > navH + 0.5) return 0
  const left = navH - stickyTop
  return clamp01(left / Math.max(1, stickyH))
}

/**
 * For tests: element displacement / scroll displacement during incoming travel.
 * Must be ≈ 1.0 for index ≥ 1.
 */
export function incomingMotionRatio(
  g: CompactNarrativeGeometry,
  sampleScrollPx = 100,
): number {
  const travel = Math.min(sampleScrollPx, g.travelPx)
  if (travel <= 0) return 1
  const slots = compactNarrativeSlotOffsets(g)
  const start = slots.arriveStart[1]!
  const a = statementVisualAtScroll(start, 1, g)
  const b = statementVisualAtScroll(start + travel, 1, g)
  const elementDelta = a.y - b.y
  return elementDelta / travel
}

/**
 * Black cover: once unpinned, sticky moves with document → ratio 1.0.
 * This helper documents the expected relationship for tests.
 */
export function blackCoverDisplacementRatio(): number {
  return 1
}
