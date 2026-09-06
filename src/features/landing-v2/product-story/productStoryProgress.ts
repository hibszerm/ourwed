/**
 * Landing V2 Product Story — reverse-Hero iPad theater progress (0→1).
 *
 * Scene 07 owns the handoff clock (`--lv2-scene07-handoff` + scene07HandoffMv).
 * Device scale, paper, and screen wake are pure functions of handoffT.
 * Sticky progress only drives post-wake tab scrub.
 *
 * Theater ownership is a pure function of the current handoff clock:
 * Problem-owned → handoff-owned → Product-owned (handoffT stays 1 past outEnd).
 */

import { HERO_THEATER_GEOMETRY_COMPACT } from '@/features/landing-v2/hero/heroTheaterGeometry'
import { scene07HandoffMv } from '@/features/landing-v2/product-story/scene07HandoffClock'

/** CSS custom property published by Problem Story Scene 07 exit. */
export const SCENE07_HANDOFF_CSS_VAR = '--lv2-scene07-handoff'

/** Float flicker guard for visual-stage / theater ownership (symmetric F/R). */
export const PRODUCT_VISUAL_EPSILON = 0.001

/**
 * Screen black→UI reveal — AFTER high-amplitude camera travel.
 * Hero blacks the screen before/during exit scale; Product must not paint
 * the full workspace under fractional scale for most of the handoff.
 * Main travel (handoff ~0–0.72): black screen + deviceCamera scale only.
 */
export const PRODUCT_SCREEN_REVEAL = { start: 0.72, end: 0.96 } as const

/**
 * Tab scrub uses remapped sticky progress AFTER screen reveal completes.
 * Ranges are relative to that post-wake sticky domain (0→1).
 */
export const PRODUCT_STORY_RANGES = {
  overviewHold: { start: 0.0, end: 0.22 },
  toLogistics: { start: 0.22, end: 0.34 },
  logisticsHold: { start: 0.34, end: 0.52 },
  toFinance: { start: 0.52, end: 0.64 },
  financeHold: { start: 0.64, end: 0.82 },
  toQuestionnaire: { start: 0.82, end: 0.92 },
  questionnaireHold: { start: 0.92, end: 1.0 },
} as const

/** Fallback cover scale until measured from real screen geometry (desktop). */
export const PRODUCT_STORY_COVER_SCALE_FALLBACK = 2.15

/**
 * Compact portrait fallback — pairs with Scene 07 compact exit scale (3.2).
 * Measured cover replaces this once the fitted slot is known.
 */
export const PRODUCT_STORY_COVER_SCALE_FALLBACK_COMPACT = 3.2

/** Desktop cover clamp — frozen (do not widen). */
export const PRODUCT_COVER_SCALE_DESKTOP = { min: 1.45, max: 2.6, safety: 1.08 } as const

/** Compact cover clamp — shared language with Hero exit overscan. */
export const PRODUCT_COVER_SCALE_COMPACT = {
  min: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMin,
  max: HERO_THEATER_GEOMETRY_COMPACT.coverScaleMax,
  safety: HERO_THEATER_GEOMETRY_COMPACT.coverScaleSafety,
} as const

export type ProductStoryTabId =
  | 'overview'
  | 'logistics'
  | 'finance'
  | 'questionnaire'

export function tabFromProgress(p: number): ProductStoryTabId {
  const r = PRODUCT_STORY_RANGES
  if (p < r.toLogistics.start) return 'overview'
  if (p < r.toFinance.start) return 'logistics'
  if (p < r.toQuestionnaire.start) return 'finance'
  return 'questionnaire'
}

export function tabProgressFromMaster(p: number): number {
  const r = PRODUCT_STORY_RANGES
  if (p < r.toLogistics.start) return 0
  if (p < r.toLogistics.end) {
    return rangeT(p, r.toLogistics.start, r.toLogistics.end)
  }
  if (p < r.toFinance.start) return 1
  if (p < r.toFinance.end) {
    return 1 + rangeT(p, r.toFinance.start, r.toFinance.end)
  }
  if (p < r.toQuestionnaire.start) return 2
  if (p < r.toQuestionnaire.end) {
    return 2 + rangeT(p, r.toQuestionnaire.start, r.toQuestionnaire.end)
  }
  return 3
}

export function rangeT(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0
  return Math.min(1, Math.max(0, (p - start) / (end - start)))
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) ** 3
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/**
 * Pure current-state theater ownership.
 * TRUE while Scene 07 handoff is active OR has completed (handoffT stays 1
 * while scroll remains past Scene 07 outEnd / inside Product Story).
 * FALSE on the Problem Story side of the boundary — no scroll direction.
 */
export function productTheaterOwned(handoffT: number): boolean {
  return handoffT > PRODUCT_VISUAL_EPSILON
}

/** Pure: Product visual stage paints iff theater is owned. */
export function productVisualActive(handoffT: number): boolean {
  return productTheaterOwned(handoffT)
}

/**
 * HandoffT where device scale first makes natural screen height ≥ viewport.
 * Pure geometry helper for blackout / crop audits (does not change curves).
 */
export function viewportCrossHandoffT(
  coverScale: number,
  screenNaturalH: number,
  viewportH: number,
): number {
  if (coverScale <= 1.0001 || screenNaturalH < 40 || viewportH < 40) return 0
  const crossScale = viewportH / screenNaturalH
  if (crossScale >= coverScale) return 0
  if (crossScale <= 1) return 1
  /* Linear inverse of deviceScaleFromHandoff */
  const t = (coverScale - crossScale) / (coverScale - 1)
  return Math.min(1, Math.max(0, t))
}

/**
 * Screen reveal 0→1 from Scene 07 handoff (black → light Graphite).
 * Linear in-window — matches Hero exitScale linear scrub (no easeOut on main travel).
 */
export function screenRevealFromHandoff(handoffT: number): number {
  return rangeT(handoffT, PRODUCT_SCREEN_REVEAL.start, PRODUCT_SCREEN_REVEAL.end)
}

export function screenBlackoutFromHandoff(handoffT: number): number {
  return 1 - screenRevealFromHandoff(handoffT)
}

/**
 * When FALSE, ProductStoryWorkspace must not paint under fractional scale.
 * Discrete threshold at reveal start — reverse scroll reconstructs correctly.
 * Blackout overlay alone is NOT enough (WebKit may still composite children).
 */
export function workspaceRenderActive(handoffT: number): boolean {
  return handoffT >= PRODUCT_SCREEN_REVEAL.start
}

export function workspaceDormantFromHandoff(handoffT: number): boolean {
  return !workspaceRenderActive(handoffT)
}

/**
 * Reverse-Hero device scale — linear in handoffT (Hero exitScale uses linear [0,1]→[1,cover]).
 */
export function deviceScaleFromHandoff(handoffT: number, coverScale: number): number {
  const t = Math.min(1, Math.max(0, handoffT))
  const cs = Math.max(1, coverScale)
  return cs - t * (cs - 1)
}

/** Stage paper mix 0→1 — linear with handoff (black field → hero paper). */
export function stagePaperFromHandoff(handoffT: number): number {
  return Math.min(1, Math.max(0, handoffT))
}

/**
 * Sticky progress AFTER pin only. No approach priming —
 * Scene 07 handoff owns the iPad camera entrance.
 */
export function stickyTrackProgress(
  el: HTMLElement,
  navH: number,
  viewportH: number,
): number {
  const rect = el.getBoundingClientRect()
  const stickyTravel = Math.max(1, el.offsetHeight - (viewportH - navH))
  if (rect.top > navH + 0.5) return 0
  const scrolled = navH - rect.top
  return Math.min(1, Math.max(0, scrolled / stickyTravel))
}

/**
 * Cover scale so the SCREEN (not merely chassis) fills the sticky stage —
 * reverse of Hero exit cover computation.
 *
 * Desktop: measure natural screen offset size (fluid tablet, no fitLock).
 * Compact: pass the fitted slot size (post outer deviceFit) — offsetWidth of a
 * fitLock 1420 canvas would under-cover portrait stages.
 */
export function computeProductCoverScale(
  sticky: HTMLElement,
  screen: HTMLElement,
  options?: {
    isCompactViewport?: boolean
    /** Settled visual size after outer deviceFit (compact). */
    fittedSlot?: { w: number; h: number } | null
    safety?: number
  },
): number {
  const isCompact = Boolean(options?.isCompactViewport)
  const clamp = isCompact ? PRODUCT_COVER_SCALE_COMPACT : PRODUCT_COVER_SCALE_DESKTOP
  const safety = options?.safety ?? clamp.safety
  const fallback = isCompact
    ? PRODUCT_STORY_COVER_SCALE_FALLBACK_COMPACT
    : PRODUCT_STORY_COVER_SCALE_FALLBACK

  const stageW = sticky.clientWidth
  const stageH = sticky.clientHeight
  const fitted = options?.fittedSlot
  const screenW =
    fitted && fitted.w > 40 ? fitted.w : screen.offsetWidth
  const screenH =
    fitted && fitted.h > 40 ? fitted.h : screen.offsetHeight
  if (stageW < 40 || stageH < 40 || screenW < 40 || screenH < 40) {
    return fallback
  }
  const next = Math.max(stageW / screenW, stageH / screenH) * safety
  return Math.min(clamp.max, Math.max(clamp.min, next))
}

export function readScene07HandoffT(): number {
  /* Prefer live MotionValue (full float) over CSS getComputedStyle serialization. */
  const live = scene07HandoffMv.get()
  if (Number.isFinite(live)) return Math.min(1, Math.max(0, live))
  if (typeof document === 'undefined') return 0
  const raw = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      SCENE07_HANDOFF_CSS_VAR,
    ),
  )
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0
}

/**
 * Temporary Product Tablet #2 render diagnostics.
 * Activate via `?lv2TabletDiag=black|noshadow|flat|static` (default: full).
 * No landing UI controls — code-only / URL-only.
 */
export type ProductTabletDiagMode =
  | 'full'
  | 'black'
  | 'noshadow'
  | 'flat'
  | 'static'

export function readProductTabletDiagMode(
  search = typeof window !== 'undefined' ? window.location.search : '',
): ProductTabletDiagMode {
  const raw = new URLSearchParams(search).get('lv2TabletDiag')
  if (
    raw === 'black' ||
    raw === 'noshadow' ||
    raw === 'flat' ||
    raw === 'static'
  ) {
    return raw
  }
  return 'full'
}

/** Synthetic continuity samples for linear device scale (tests / diagnostics). */
export function deviceScaleContinuitySamples(
  coverScale: number,
  deltasPx: readonly number[],
  handoffScrollBudgetPx: number,
): Array<{ scrollDelta: number; handoffDelta: number; scaleDelta: number }> {
  const budget = Math.max(1, handoffScrollBudgetPx)
  return deltasPx.map((scrollDelta) => {
    const handoffDelta = scrollDelta / budget
    const scaleDelta = -handoffDelta * (coverScale - 1)
    return { scrollDelta, handoffDelta, scaleDelta }
  })
}
