/**
 * Compact Security reveal (3G.1) — compositor-only phone→lock.
 *
 * Desktop keeps HeroPhoneFrame geometry morph (aspectRatio / radius / pad).
 * Compact: phone exits with transform+opacity; a pre-mounted lock reveals beneath.
 * No aspect-ratio / width / height / border-radius / clip animation on compact.
 */

import { easeOutCubic, rangeT } from '@/features/landing-v2/mobile-story/postBriefSecurityProgress'

/** Keep ~3G 90svh phone→lock runway (±5%). */
export const COMPACT_POST_BRIEF_RUNWAY_SVH = 90

/**
 * Compact studio intro after Security — shortened vs 3G 72svh to cut dead hold
 * before document-flow seasons (no empty desert under History copy).
 */
export const COMPACT_STUDIO_HISTORY_SVH = 56

/** Established large-lock vertical target (fraction of sticky stage). */
export const COMPACT_SECURITY_LOCK_CENTER_PCT = 40

/** Phone exit — calm clear, not morph-to-lock-size. */
export const COMPACT_PHONE_EXIT = {
  scaleEnd: 0.85,
  yVhEnd: -6,
  /** Opacity clears after lock is already readable. */
  opacity: { start: 0.42, end: 0.88 },
  scale: { start: 0.001, end: 0.62 },
  y: { start: 0.001, end: 0.62 },
} as const

/** Lock already mounted beneath — gentle fade/settle into established size. */
export const COMPACT_LOCK_REVEAL = {
  scaleStart: 0.94,
  scaleEnd: 1,
  yPxStart: 14,
  opacity: { start: 0.28, end: 0.78 },
  scale: { start: 0.28, end: 0.78 },
  y: { start: 0.28, end: 0.78 },
} as const

/** Security copy fades in after lock is mostly established. */
export const COMPACT_SECURITY_COPY = {
  start: 0.58,
  end: 0.78,
} as const

/**
 * Compact studio scroll → visual: front-load lock travel + History intro,
 * compress post-settled hold so seasons arrive sooner after sticky release.
 */
export function compactStudioVisualAt(p: number): number {
  const x = Math.min(1, Math.max(0, p))
  /** Through support settle (desktop STUDIO_HISTORY_RANGES.support.end). */
  const meaningfulEnd = 0.56
  const share = 0.82
  if (x <= share) return (x / share) * meaningfulEnd
  return meaningfulEnd + ((x - share) / Math.max(1 - share, 1e-6)) * (1 - meaningfulEnd)
}

export function compactPhoneExitScaleAt(pb: number): number {
  const t = rangeT(pb, COMPACT_PHONE_EXIT.scale.start, COMPACT_PHONE_EXIT.scale.end)
  return 1 - t * (1 - COMPACT_PHONE_EXIT.scaleEnd)
}

export function compactPhoneExitYVhAt(pb: number): number {
  const t = rangeT(pb, COMPACT_PHONE_EXIT.y.start, COMPACT_PHONE_EXIT.y.end)
  return COMPACT_PHONE_EXIT.yVhEnd * t
}

export function compactPhoneExitOpacityAt(pb: number): number {
  return 1 - easeOutCubic(rangeT(pb, COMPACT_PHONE_EXIT.opacity.start, COMPACT_PHONE_EXIT.opacity.end))
}

export function compactLockRevealOpacityAt(pb: number): number {
  return easeOutCubic(rangeT(pb, COMPACT_LOCK_REVEAL.opacity.start, COMPACT_LOCK_REVEAL.opacity.end))
}

export function compactLockRevealScaleAt(pb: number): number {
  const t = rangeT(pb, COMPACT_LOCK_REVEAL.scale.start, COMPACT_LOCK_REVEAL.scale.end)
  return (
    COMPACT_LOCK_REVEAL.scaleStart +
    t * (COMPACT_LOCK_REVEAL.scaleEnd - COMPACT_LOCK_REVEAL.scaleStart)
  )
}

export function compactLockRevealYPxAt(pb: number): number {
  const t = easeOutCubic(rangeT(pb, COMPACT_LOCK_REVEAL.y.start, COMPACT_LOCK_REVEAL.y.end))
  return COMPACT_LOCK_REVEAL.yPxStart * (1 - t)
}

export function compactSecurityCopyAt(pb: number): number {
  return easeOutCubic(rangeT(pb, COMPACT_SECURITY_COPY.start, COMPACT_SECURITY_COPY.end))
}
