/**
 * Compact Security recovery (3G.2) — helpers only.
 *
 * 3G.1 "phone reveals pre-mounted lock" architecture is REJECTED and removed.
 * Visual phone→lock choreography returns to f019 continuous morph language.
 *
 * These tokens separate PHONE settled Y from SECURITY lock established Y so a
 * higher final lock never pulls the phone start position upward.
 */

import { rangeT } from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'

/** Keep accepted 3G phone→lock runway (±5%). */
export const COMPACT_POST_BRIEF_RUNWAY_SVH = 90

/**
 * Sticky stage center for PHONE established / morph start (f019 baseline).
 * Must NOT equal the established Security lock center.
 */
export const COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT = 50

/**
 * Final large-lock center after morph + late lift (~40–42% usable stage).
 * Applied only after morph is largely complete — never at morph start.
 */
export const COMPACT_SECURITY_LOCK_CENTER_PCT = 41

/** Late lift amplitude: 50% → 41% of sticky stage ≈ −9vh. */
export const COMPACT_SECURITY_LOCK_LIFT_VH =
  COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT - COMPACT_SECURITY_LOCK_CENTER_PCT

/**
 * Visual postBrief ranges for late Security lock lift (desktop visual progress).
 * Starts at securityHold so phone settled + early morph stay at stageCenter 50%.
 */
export const COMPACT_SECURITY_LOCK_LIFT = {
  start: 0.72,
  end: 0.86,
} as const

/**
 * Extra translateY (vh) on the phoneSystem after morph — identity at morph start.
 * Linear, reverse-deterministic. No spring.
 */
export function compactSecurityLockLiftVhAt(visualPb: number): number {
  const t = rangeT(visualPb, COMPACT_SECURITY_LOCK_LIFT.start, COMPACT_SECURITY_LOCK_LIFT.end)
  return -COMPACT_SECURITY_LOCK_LIFT_VH * t
}

/** Morph-start flatten threshold — same as POST_BRIEF_MORPH_START. */
export const COMPACT_SCREEN_FLATTEN_START = 0.001

/**
 * Continuity samples around morph start (scroll progress units ≈ px on 90svh).
 * Used by recovery tests — shrink scale must be continuous / monotonic.
 */
export const COMPACT_MORPH_CONTINUITY_SAMPLES = [
  COMPACT_SCREEN_FLATTEN_START - 0.001,
  COMPACT_SCREEN_FLATTEN_START,
  COMPACT_SCREEN_FLATTEN_START + 0.001,
  COMPACT_SCREEN_FLATTEN_START + 0.005,
] as const
