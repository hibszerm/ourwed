/**
 * Compact Security recovery (3G.2) + post-lock Y tokens (3G.3).
 *
 * Phone settled Y and Security lock Y stay SEPARATE.
 * 3G.3 raises established Security lock only — never phone morph start.
 */

import { rangeT } from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'
import {
  COMPACT_PHONE_SETTLED_Y_PCT,
  COMPACT_SECURITY_LOCK_Y_PCT,
} from '@/features/landing-v2/mobile-story/compactPostLockContinuity'

/** Keep accepted 3G phone→lock runway (±5%). */
export const COMPACT_POST_BRIEF_RUNWAY_SVH = 90

/** @deprecated Use COMPACT_PHONE_SETTLED_Y_PCT — kept for 3G.2 test aliases. */
export const COMPACT_PHONE_SETTLED_STAGE_CENTER_PCT = COMPACT_PHONE_SETTLED_Y_PCT

/** Established large-lock center after morph + late lift (3G.3: ~38.5%). */
export const COMPACT_SECURITY_LOCK_CENTER_PCT = COMPACT_SECURITY_LOCK_Y_PCT

/** Late lift amplitude: PHONE_SETTLED → SECURITY_LOCK (svh-stable). */
export const COMPACT_SECURITY_LOCK_LIFT_VH =
  COMPACT_PHONE_SETTLED_Y_PCT - COMPACT_SECURITY_LOCK_Y_PCT

/**
 * Visual postBrief ranges for late Security lock lift.
 * Starts at securityHold so phone settled + early morph stay at stageCenter 50%.
 */
export const COMPACT_SECURITY_LOCK_LIFT = {
  start: 0.72,
  end: 0.86,
} as const

/**
 * Extra translateY (svh) on the phoneSystem after morph — identity at morph start.
 * Linear, reverse-deterministic. Completes at LOCK_ESTABLISHED before studio travel.
 */
export function compactSecurityLockLiftVhAt(visualPb: number): number {
  const t = rangeT(visualPb, COMPACT_SECURITY_LOCK_LIFT.start, COMPACT_SECURITY_LOCK_LIFT.end)
  return -COMPACT_SECURITY_LOCK_LIFT_VH * t
}

/** Morph-start flatten threshold — same as POST_BRIEF_MORPH_START. */
export const COMPACT_SCREEN_FLATTEN_START = 0.001

export const COMPACT_MORPH_CONTINUITY_SAMPLES = [
  COMPACT_SCREEN_FLATTEN_START - 0.001,
  COMPACT_SCREEN_FLATTEN_START,
  COMPACT_SCREEN_FLATTEN_START + 0.001,
  COMPACT_SCREEN_FLATTEN_START + 0.005,
] as const
