/**
 * Compact Problem Story — Iteration 3C / 3C.1 pixel-coupled narrative geometry.
 *
 * BEFORE (3B) on ~874× CSS viewport:
 *   incoming travel ≈ 367px over ≈ 97px scroll → ratio ≈ 3.80 (FAILED)
 *   outgoing stayed opacity 1 until incoming was ~31px from center (COLLISION)
 *   black exit = sticky opacity fade (NOT document 1:1)
 *
 * 3C.1 ROOT CAUSE (missing stmts 3–7):
 *   outgoingDuringIncoming kept active=true forever via residual translateY
 *   (|y| > 0.5 after opacity≈0). activeStatementIndicesAtScroll then did
 *   out.slice(0, 2), permanently locking the painted pair to indexes [0, 1].
 *   Statements 2–6 computed correct visuals but were never applied to the DOM.
 *
 * 3C.1 Statement 1 timing:
 *   Opening statement starts readable at scrub=0 (black-stage ownership).
 *
 * CSS scroll-timeline NOT used as the motion source of truth: sticky reading
 * viewport + dual-layer spatial handoff + Founder document cover are expressed
 * more reliably as scroll-position → translate3d/opacity with ratio 1.0.
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

/**
 * Opening statement is already readable at black-stage ownership (scrub=0).
 * Optional micro-settle completes within this short scroll (not a full travel).
 */
export const COMPACT_NARRATIVE_OPENING_OPACITY = 0.92

export type CompactNarrativeGeometry = {
  navH: number
  viewportH: number
  stickyH: number
  /** Incoming start offset below reading position (px). */
  travelPx: number
  /** Calm hold after arrival (px) — separate from travel. */
  holdPx: number
  /** First statement micro-settle scroll (px) — intentionally tiny. */
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
  /* Tiny settle only — Statement 1 must be readable at scrub≈0. */
  const introPx = Math.round(Math.min(28, stickyH * 0.035))
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
 * Statement 0: [0, intro] micro-settle (already readable at 0)
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

  /* ——— Statement 0: opening — readable immediately at black-stage ownership ——— */
  if (index === 0) {
    if (s < slots.arriveEnd[0]!) {
      const t = g.introPx <= 0 ? 1 : s / g.introPx
      const opacity =
        COMPACT_NARRATIVE_OPENING_OPACITY +
        (1 - COMPACT_NARRATIVE_OPENING_OPACITY) * clamp01(t)
      return {
        opacity,
        y: Math.round((1 - clamp01(t)) * Math.min(12, g.travelPx * 0.03)),
        active: true,
      }
    }
    /* Hold until statement 1 begins arriving */
    if (s < slots.arriveStart[1]!) {
      return { opacity: 1, y: 0, active: true }
    }
    /* Outgoing only while statement 1 is traveling — then fully inactive */
    if (s < slots.arriveEnd[1]!) {
      return outgoingDuringIncoming(s, 1, g, slots)
    }
    return { opacity: 0, y: 0, active: false }
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
    const y = Math.max(
      0,
      g.travelPx - scrolled * COMPACT_NARRATIVE_INCOMING_RATIO,
    )
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

  /* Outgoing while next arrives — inactive once next has landed */
  if (index + 1 < COMPACT_NARRATIVE_STATEMENT_COUNT) {
    const nextEnd = slots.arriveEnd[index + 1]!
    if (s < nextEnd) {
      return outgoingDuringIncoming(s, index + 1, g, slots)
    }
    return { opacity: 0, y: 0, active: false }
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

  if (travelT >= 1) {
    return { opacity: 0, y: 0, active: false }
  }

  const y = Math.round(-scrolled * COMPACT_NARRATIVE_OUTGOING_RATIO)
  const fadeT = clamp01(travelT / COMPACT_NARRATIVE_OUTGOING_FADE_DONE)
  const opacity = clamp01(1 - fadeT)

  return {
    opacity,
    y,
    /* Active only while still visible — residual Y alone must NOT keep it active. */
    active: opacity > 0.01,
  }
}

/**
 * Collision model: when incoming top enters outgoing occupancy zone,
 * outgoing opacity must be ≤ 0.15.
 */
export function collisionInvariantHolds(
  g: CompactNarrativeGeometry,
  incomingIndex: number,
): { ok: boolean; atIncomingY: number; outgoingOpacity: number } {
  const slots = compactNarrativeSlotOffsets(g)
  const start = slots.arriveStart[incomingIndex]!
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

/**
 * Active pair indices (max 2).
 * Collects currently active statements in index order — must NOT slice to
 * permanently prefer [0,1] while stale earlier layers remain flagged active.
 */
export function activeStatementIndicesAtScroll(
  scrollIntoScrub: number,
  g: CompactNarrativeGeometry,
): number[] {
  const out: number[] = []
  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    if (statementVisualAtScroll(scrollIntoScrub, i, g).active) out.push(i)
  }
  /* Safety: if a bug reintroduces stale actives, keep the latest pair. */
  return out.length <= 2 ? out : out.slice(-2)
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

/** Black cover: once unpinned, sticky moves with document → ratio 1.0. */
export function blackCoverDisplacementRatio(): number {
  return 1
}

/** Primary readable statement at scroll (opacity ≥ 0.95, y ≈ 0). */
export function primaryStatementAtScroll(
  scrollIntoScrub: number,
  g: CompactNarrativeGeometry,
): number | null {
  let best: number | null = null
  let bestOp = 0
  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    const v = statementVisualAtScroll(scrollIntoScrub, i, g)
    if (v.opacity >= 0.95 && Math.abs(v.y) <= 1 && v.opacity >= bestOp) {
      best = i
      bestOp = v.opacity
    }
  }
  return best
}

/** Max opacity across statements — used for no-empty-frame invariant. */
export function maxStatementOpacityAtScroll(
  scrollIntoScrub: number,
  g: CompactNarrativeGeometry,
): number {
  let max = 0
  for (let i = 0; i < COMPACT_NARRATIVE_STATEMENT_COUNT; i++) {
    max = Math.max(max, statementVisualAtScroll(scrollIntoScrub, i, g).opacity)
  }
  return max
}
