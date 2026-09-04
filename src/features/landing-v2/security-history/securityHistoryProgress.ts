/**
 * Studio History chapter — AFTER Mobile-owned phone→lock security beat.
 * Does NOT control HeroPhoneFrame. No phone morph publishers.
 */

export const PHONE_ASPECT = 932 / 430
export const PHONE_ASPECT_RATIO = 430 / 932
export const LOCK_ASPECT_RATIO = 158 / 124

export const LOCK_BODY = {
  w: 158,
  h: 124,
  r: 28,
} as const

/** History-only track leftover (scroll chapter absorbed into MobileStory). */
export const SECURITY_HISTORY_TRACK_SVH = 0

export const SECURITY_HISTORY_RANGES = {
  historyIn: { start: 0.08, end: 0.35 },
  historyHold: { start: 0.35, end: 1.0 },
} as const

export function rangeT(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0
  return Math.min(1, Math.max(0, (p - start) / (end - start)))
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) ** 3
}
