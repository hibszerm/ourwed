/**
 * Compact post-lock continuity (3G.3) — LOCK_ESTABLISHED → HISTORY_LOCK_SETTLED.
 *
 * Phone→lock morph is FROZEN. This module owns only the post-lock path.
 *
 * Problems addressed:
 * - securityHold + lockSettledGate created move→stop→move / empty beige frames
 * - easeOutCubic on copy exit → zero velocity kink before History entry
 * - stacked postBrief lift + studio travel felt like separate phases
 * - vh / dynamic viewport geometry jumped when Safari chrome expanded → use svh tokens only
 *
 * Compact lock travel is ONE linear progress. History overlaps lock motion.
 * Years peek inside sticky so 2026 is visible at History established.
 *
 * Geometry uses stable layout tokens / svh — never transient browser chrome height.
 */

import { rangeT } from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'

/** Compact History intro runway — shortened vs 3G 72svh; near-zero dead hold. */
export const MOBILE_TRACK_STUDIO_HISTORY_SVH_COMPACT_3G3 = 58

/**
 * Stable post-lock geometry tokens (stage % of sticky / layout viewport).
 * NOT shared with PHONE_SETTLED (50%). Do not derive from transient chrome height.
 */
export const COMPACT_PHONE_SETTLED_Y_PCT = 50
/** Established large Security lock — raised for balanced composition. */
export const COMPACT_SECURITY_LOCK_Y_PCT = 38.5
/** Small History lock — lands in `.lockSlot` above TWOJE STUDIO. */
export const COMPACT_HISTORY_LOCK_Y_PCT = 18

/** Extra studio translate (svh) from SECURITY_LOCK → HISTORY_LOCK. Linear. */
export const COMPACT_POST_LOCK_Y_SVH_END =
  COMPACT_HISTORY_LOCK_Y_PCT - COMPACT_SECURITY_LOCK_Y_PCT

/** Scale multiplier on top of POST_BRIEF_SHRINK_END (0.48). */
export const COMPACT_POST_LOCK_SCALE_END = 0.28

/**
 * Single continuous compact post-lock timeline (studioProgress 0→1).
 * No securityHold dead zone. Lock motion starts immediately.
 */
export const COMPACT_POST_LOCK_RANGES = {
  /** ONE lock path — linear scale + translate to History slot. */
  lockTravel: { start: 0.0, end: 0.7 },
  /** Security fades while lock already moves (overlap). LINEAR. */
  securityExit: { start: 0.0, end: 0.38 },
  /** History enters before lock finishes — no empty beige frame. */
  eyebrow: { start: 0.22, end: 0.48 },
  headline: { start: 0.28, end: 0.55 },
  support: { start: 0.34, end: 0.62 },
  /** 2026 peek at lower viewport while History intro settles. */
  yearsPeek: { start: 0.45, end: 0.7 },
  /** Short settle — lock static deliberately, History readable. */
  hold: { start: 0.7, end: 1.0 },
} as const

export function compactPostLockTravelT(p: number): number {
  return rangeT(
    p,
    COMPACT_POST_LOCK_RANGES.lockTravel.start,
    COMPACT_POST_LOCK_RANGES.lockTravel.end,
  )
}

/** Linear lock scale 1 → COMPACT_POST_LOCK_SCALE_END. */
export function compactPostLockScaleAt(p: number): number {
  const t = compactPostLockTravelT(p)
  return 1 - t * (1 - COMPACT_POST_LOCK_SCALE_END)
}

/**
 * Extra translateY in svh from SECURITY established toward HISTORY slot.
 * Identity at p=0 (lock already at SECURITY_LOCK_Y via postBrief late lift).
 */
export function compactPostLockYSvhAt(p: number): number {
  return COMPACT_POST_LOCK_Y_SVH_END * compactPostLockTravelT(p)
}

/** Security copy opacity — linear, overlaps lock travel. */
export function compactPostLockSecurityCopyOpAt(p: number): number {
  return (
    1 -
    rangeT(
      p,
      COMPACT_POST_LOCK_RANGES.securityExit.start,
      COMPACT_POST_LOCK_RANGES.securityExit.end,
    )
  )
}

export function compactPostLockSecurityCopyYAt(p: number): number {
  const t = rangeT(
    p,
    COMPACT_POST_LOCK_RANGES.securityExit.start,
    COMPACT_POST_LOCK_RANGES.securityExit.end,
  )
  return t * -10
}

/** History copy — linear reveal, NO lockSettledGate (overlap desired). */
export function compactPostLockEyebrowOpAt(p: number): number {
  return rangeT(p, COMPACT_POST_LOCK_RANGES.eyebrow.start, COMPACT_POST_LOCK_RANGES.eyebrow.end)
}

export function compactPostLockHeadlineOpAt(p: number): number {
  return rangeT(p, COMPACT_POST_LOCK_RANGES.headline.start, COMPACT_POST_LOCK_RANGES.headline.end)
}

export function compactPostLockSupportOpAt(p: number): number {
  return rangeT(p, COMPACT_POST_LOCK_RANGES.support.start, COMPACT_POST_LOCK_RANGES.support.end)
}

export function compactPostLockYearsPeekOpAt(p: number): number {
  return rangeT(p, COMPACT_POST_LOCK_RANGES.yearsPeek.start, COMPACT_POST_LOCK_RANGES.yearsPeek.end)
}

export function compactPostLockRevealYAt(op: number): number {
  return (1 - op) * 14
}

/** Continuity samples across every compact post-lock boundary. */
export const COMPACT_POST_LOCK_BOUNDARY_SAMPLES = [
  COMPACT_POST_LOCK_RANGES.lockTravel.start,
  COMPACT_POST_LOCK_RANGES.securityExit.end,
  COMPACT_POST_LOCK_RANGES.eyebrow.start,
  COMPACT_POST_LOCK_RANGES.headline.start,
  COMPACT_POST_LOCK_RANGES.support.start,
  COMPACT_POST_LOCK_RANGES.yearsPeek.start,
  COMPACT_POST_LOCK_RANGES.lockTravel.end,
  COMPACT_POST_LOCK_RANGES.hold.start,
] as const
