/**
 * Post-Brief security morph — MobileStory-owned, ONE timeline.
 *
 * Appended AFTER existing app/theater content travel (Brief settled).
 * Does NOT remap Dashboard / Wedding Day / Navigation / Brief pacing.
 *
 * INVARIANT — synchronized morph start:
 * The first visible shrink frame MUST also be the first visible lock-morph frame.
 * Shrink, Brief fade, black merge, and body compress all begin at
 * POST_BRIEF_MORPH_START. They may end at different times; they must not start
 * at staggered thresholds.
 *
 * Main spatial motion (shrink, compress) is LINEAR in scroll.
 * No spring. No easeOut on scale amplitude.
 */

import { LOCK_ASPECT_RATIO, PHONE_ASPECT_RATIO } from '@/features/landing-v2/security-history/securityHistoryProgress'

/** Dedicated post-Brief tail — tightened for denser Security→History handoff. */
export const MOBILE_TRACK_POST_BRIEF_SVH = 112

/**
 * Compact (3G): ~80% of desktop post-Brief runway.
 * Dead hold/handoff scroll is compressed; morph physical travel stays ≈ desktop
 * via compactPostBriefVisualAt remapping (not by accelerating shrink).
 */
export const MOBILE_TRACK_POST_BRIEF_SVH_COMPACT = 90

/** Desktop morph→LOCK+COPY threshold (securityCopy.start). Used by compact remap. */
export const POST_BRIEF_LOCK_ESTABLISHED = 0.58

/**
 * Shared start for shrink + Brief fade + black merge + body morph.
 * Effectively no hold after final Brief — tiny scroll begins the transform.
 */
export const POST_BRIEF_MORPH_START = 0.001

/**
 * Map compact postBrief scroll progress → desktop-equivalent visual progress.
 * Keeps Stage-1/2 morph physical scroll ≈ prior 112svh allocation while the
 * compact runway is only 90svh (~20% shorter) by compressing post-lock holds.
 */
export function compactPostBriefVisualAt(pb: number): number {
  const p = Math.min(1, Math.max(0, pb))
  const morphShare =
    (POST_BRIEF_LOCK_ESTABLISHED * MOBILE_TRACK_POST_BRIEF_SVH) /
    MOBILE_TRACK_POST_BRIEF_SVH_COMPACT
  if (p <= morphShare) {
    return (p / Math.max(morphShare, 1e-6)) * POST_BRIEF_LOCK_ESTABLISHED
  }
  return (
    POST_BRIEF_LOCK_ESTABLISHED +
    ((p - morphShare) / Math.max(1 - morphShare, 1e-6)) * (1 - POST_BRIEF_LOCK_ESTABLISHED)
  )
}

export function postBriefRunwaySvh(compact: boolean): number {
  return compact ? MOBILE_TRACK_POST_BRIEF_SVH_COMPACT : MOBILE_TRACK_POST_BRIEF_SVH
}
/**
 * STAGED MORPH CHOREOGRAPHY:
 *
 * Stage 1 — transform-only (no layout reflow):
 *   outerScale shrinks, screenMerge darkens, screenFade fades Brief.
 *   bodyCompress STAYS AT 0 — phone layout geometry is frozen.
 *
 * Stage 2 — geometry morph (Brief unreadable):
 *   bodyCompress begins ONLY after Brief opacity ≤ ~0.10 and screenMerge ≥ ~0.90.
 *   Chassis aspect ratio, padding, bezel start transitioning to lock shape.
 *
 * INVARIANT: bodyCompress must remain 0 while briefOpacity > 0.10.
 */
export const POST_BRIEF_RANGES = {
  /** Continuity only — morph begins at POST_BRIEF_MORPH_START. */
  briefHold: { start: 0.0, end: POST_BRIEF_MORPH_START },
  /**
   * Stage 1 — LINEAR proportional shrink of entire phoneSystem.
   * CSS transform only; no layout change. Starts immediately.
   */
  phoneShrink: { start: POST_BRIEF_MORPH_START, end: 0.26 },
  /**
   * Stage 1 — Internal Brief/app UI fade — SAME start as shrink.
   * Must reach ~0 by phoneShrink.end so body morph can begin safely.
   */
  screenFade: { start: POST_BRIEF_MORPH_START, end: 0.22 },
  /** Dynamic Island / buttons — slightly earlier than original for cleanliness. */
  chromeFade: { start: 0.01, end: 0.22 },
  /**
   * Stage 1 — Black screen merge — SAME start as shrink (crossfade, not filter).
   * Must reach ~1 before body morph begins.
   */
  screenMerge: { start: POST_BRIEF_MORPH_START, end: 0.24 },
  /**
   * Stage 2 — Height-led chassis → lock geometry.
   * DELAYED: must not begin until Brief is effectively unreadable.
   * Brief opacity ≤ ~0.10 at screenFade.end (0.22), so bodyCompress starts at 0.24.
   * This separates visual scale (Stage 1) from layout-affecting morph (Stage 2).
   */
  bodyCompress: { start: 0.24, end: 0.52 },
  /** Closed shackle — starts mid-compress. */
  shackle: { start: 0.30, end: 0.52 },
  keyhole: { start: 0.40, end: 0.56 },
  lockSettle: { start: 0.54, end: 0.62 },
  securityCopy: { start: 0.58, end: 0.72 },
  securityHold: { start: 0.72, end: 0.86 },
  handoff: { start: 0.86, end: 1.0 },
} as const

/**
 * The normalized progress threshold at which bodyCompress begins.
 * Exported for regression tests — must be > screenFade.end.
 */
export const POST_BRIEF_BODY_COMPRESS_START = POST_BRIEF_RANGES.bodyCompress.start

/** End shrink scale — preserve current final lock footprint. */
export const POST_BRIEF_SHRINK_END = 0.48

export const POST_BRIEF_LOCK_RADIUS_PX = 28

export function rangeT(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0
  return Math.min(1, Math.max(0, (p - start) / (end - start)))
}

/** Soft opacity only — never used for main spatial travel. */
export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) ** 3
}

/** LINEAR shrink scale: 1 → POST_BRIEF_SHRINK_END. */
export function postBriefShrinkScaleAt(p: number): number {
  const t = rangeT(p, POST_BRIEF_RANGES.phoneShrink.start, POST_BRIEF_RANGES.phoneShrink.end)
  return 1 - t * (1 - POST_BRIEF_SHRINK_END)
}

/** Internal Brief/app opacity (outer phone stays 1). */
export function postBriefContentOpAt(p: number): number {
  return 1 - easeOutCubic(rangeT(p, POST_BRIEF_RANGES.screenFade.start, POST_BRIEF_RANGES.screenFade.end))
}

export function postBriefChromeOpAt(p: number): number {
  return 1 - easeOutCubic(rangeT(p, POST_BRIEF_RANGES.chromeFade.start, POST_BRIEF_RANGES.chromeFade.end))
}

export function postBriefScreenMergeAt(p: number): number {
  return easeOutCubic(rangeT(p, POST_BRIEF_RANGES.screenMerge.start, POST_BRIEF_RANGES.screenMerge.end))
}

/** LINEAR body compress 0→1 — delayed to Stage 2, Brief must be unreadable first. */
export function postBriefCompressAt(p: number): number {
  return rangeT(p, POST_BRIEF_RANGES.bodyCompress.start, POST_BRIEF_RANGES.bodyCompress.end)
}

export function postBriefAspectRatioAt(p: number): number {
  const c = postBriefCompressAt(p)
  return PHONE_ASPECT_RATIO + (LOCK_ASPECT_RATIO - PHONE_ASPECT_RATIO) * c
}

export function postBriefShackleAt(p: number): number {
  return easeOutCubic(rangeT(p, POST_BRIEF_RANGES.shackle.start, POST_BRIEF_RANGES.shackle.end))
}

export function postBriefKeyholeAt(p: number): number {
  return easeOutCubic(rangeT(p, POST_BRIEF_RANGES.keyhole.start, POST_BRIEF_RANGES.keyhole.end))
}

export function postBriefSecurityCopyAt(p: number): number {
  return easeOutCubic(rangeT(p, POST_BRIEF_RANGES.securityCopy.start, POST_BRIEF_RANGES.securityCopy.end))
}

/** Invariant: outer phone/lock effective opacity is always 1 during post-brief. */
export function postBriefOuterOpacityAt(p: number): number {
  void p
  return 1
}

/**
 * STAGE-1 NAMED ALIASES (for tests, trace, and readability):
 *
 * These are the three Stage-1 values that start immediately at POST_BRIEF_MORPH_START
 * and must NOT be confused with Stage-2 body geometry morph.
 */

/** Stage 1: outer phoneSystem CSS transform scale. Never layout-affecting. */
export const postBriefOuterScaleAt = postBriefShrinkScaleAt

/** Stage 1: internal Brief/app UI opacity. ≤ 0.10 → Brief unreadable → Stage 2 safe. */
export const postBriefBriefOpacityAt = postBriefContentOpAt

/** Stage 2: chassis geometry compress. Always 0 while briefOpacity > 0.10. */
export const postBriefBodyCompressAt = postBriefCompressAt

export type PostBriefPercept = 'PHONE' | 'SMALL PHONE' | 'PHONE→LOCK' | 'LOCK' | 'LOCK + COPY'

export function postBriefPerceptAt(p: number): PostBriefPercept {
  if (p < POST_BRIEF_MORPH_START) return 'PHONE'
  if (p < POST_BRIEF_RANGES.shackle.start) return 'SMALL PHONE'
  if (p < POST_BRIEF_RANGES.lockSettle.start) return 'PHONE→LOCK'
  if (p < POST_BRIEF_RANGES.securityCopy.start) return 'LOCK'
  return 'LOCK + COPY'
}
