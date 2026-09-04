/**
 * Lock → Studio History chapter — AFTER the approved Security final frame.
 *
 * Does NOT remap postBrief / Phone→Lock / Security intro.
 * studioProgress = 0 is identity: lock scale/Y and Security copy match
 * the settled Security composition exactly.
 *
 * Spatial motion is transform-only (scale + translateY). No geometry morph.
 */

import { easeOutCubic, rangeT } from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'

/** Appended AFTER the post-Brief tail. Does not steal from it. */
export const MOBILE_TRACK_STUDIO_HISTORY_SVH = 145

/**
 * Extra lock scale on top of POST_BRIEF_SHRINK_END (0.48).
 * 0.175 × lock visual width ≈ 29–36px across 1440–1920.
 */
export const STUDIO_LOCK_SCALE_END = 0.175

/** Upward travel in vh from stage-center (46%) toward studio composition. */
export const STUDIO_LOCK_Y_VH_END = -30

export const STUDIO_HISTORY_RANGES = {
  /** Readable Security beat — scales with studio-history svh budget. */
  securityHold: { start: 0.0, end: 0.06 },
  /** SAME start as copy exit — transform-only lock shrink + lift. UNCHANGED. */
  lockTravel: { start: 0.06, end: 0.38 },
  securityExit: { start: 0.06, end: 0.28 },
  /**
   * Studio text AFTER lock is ~94%+ settled (lockTravel ends 0.38).
   * Must not appear while the lock is still travelling through this space.
   * Forward ranges unchanged — visibility is further gated by lockSettledGate.
   */
  eyebrow: { start: 0.36, end: 0.46 },
  headline: { start: 0.4, end: 0.52 },
  support: { start: 0.44, end: 0.56 },
  /** Downstream season block shifted later to keep relative stagger. */
  timeline: { start: 0.5, end: 0.62 },
  year2026: { start: 0.56, end: 0.66 },
  year2027: { start: 0.6, end: 0.7 },
  year2028: { start: 0.64, end: 0.74 },
  cards: { start: 0.58, end: 0.76 },
  hold: { start: 0.76, end: 1.0 },
} as const

/**
 * Lock-settled visibility gate (pure progress — no scroll direction).
 *
 * Mapped in lockTravel local t: 0.96 → 1.00 ≈ studioProgress 0.367 → 0.38.
 * FORWARD: text cannot show until lock is ~96% settled.
 * REVERSE: text collapses as soon as lock leaves the settled tip — before
 * significant downward travel / growth (≈20–25px physical reverse).
 */
export const STUDIO_LOCK_SETTLED_GATE = { lockTStart: 0.96, lockTEnd: 1.0 } as const

/** Lock travel local 0→1 within lockTravel range. */
export function studioLockTravelT(p: number): number {
  return rangeT(p, STUDIO_HISTORY_RANGES.lockTravel.start, STUDIO_HISTORY_RANGES.lockTravel.end)
}

/**
 * 0 while lock is away from final studio seat; 1 only when fully settled.
 * LINEAR — same mapping both directions (no hysteresis / direction state).
 */
export function studioLockSettledGateAt(p: number): number {
  return rangeT(
    studioLockTravelT(p),
    STUDIO_LOCK_SETTLED_GATE.lockTStart,
    STUDIO_LOCK_SETTLED_GATE.lockTEnd,
  )
}

export function studioLockScaleAt(p: number): number {
  const t = studioLockTravelT(p)
  return 1 - t * (1 - STUDIO_LOCK_SCALE_END)
}

export function studioLockYVhAt(p: number): number {
  return STUDIO_LOCK_Y_VH_END * studioLockTravelT(p)
}

/** Security copy group opacity. 1 at p=0 (approved frame). */
export function studioSecurityCopyOpAt(p: number): number {
  return 1 - easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.securityExit.start, STUDIO_HISTORY_RANGES.securityExit.end))
}

/** 0 → -12px. 0 at p=0. */
export function studioSecurityCopyYAt(p: number): number {
  const t = easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.securityExit.start, STUDIO_HISTORY_RANGES.securityExit.end))
  return t * -12
}

export function studioEyebrowOpAt(p: number): number {
  const reveal = easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.eyebrow.start, STUDIO_HISTORY_RANGES.eyebrow.end))
  return reveal * studioLockSettledGateAt(p)
}

export function studioHeadlineOpAt(p: number): number {
  const reveal = easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.headline.start, STUDIO_HISTORY_RANGES.headline.end))
  return reveal * studioLockSettledGateAt(p)
}

export function studioSupportOpAt(p: number): number {
  const reveal = easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.support.start, STUDIO_HISTORY_RANGES.support.end))
  return reveal * studioLockSettledGateAt(p)
}

export function studioRevealYAt(op: number): number {
  return (1 - op) * 16
}

export function studioTimelineOpAt(p: number): number {
  return easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.timeline.start, STUDIO_HISTORY_RANGES.timeline.end))
}

export function studioYear2026OpAt(p: number): number {
  return easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.year2026.start, STUDIO_HISTORY_RANGES.year2026.end))
}

export function studioYear2027OpAt(p: number): number {
  return easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.year2027.start, STUDIO_HISTORY_RANGES.year2027.end))
}

export function studioYear2028OpAt(p: number): number {
  return easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.year2028.start, STUDIO_HISTORY_RANGES.year2028.end))
}

export function studioCardsOpAt(p: number): number {
  return easeOutCubic(rangeT(p, STUDIO_HISTORY_RANGES.cards.start, STUDIO_HISTORY_RANGES.cards.end))
}

export function studioHistoryVisibleAt(p: number): number {
  return studioEyebrowOpAt(p)
}
