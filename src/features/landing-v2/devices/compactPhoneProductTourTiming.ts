/**
 * Compact phone tour timing — Iteration 3F.2
 *
 * Desktop MOBILE_APP_RANGES remain the visual choreography source of truth.
 * Autonomous playback uses bespoke segment durations (not linear time≡progress).
 */

import { MOBILE_APP_RANGES } from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'

/** Calm beat after phone lands, before tour. */
export const COMPACT_PHONE_TOUR_SETTLE_DELAY_MS = 500

/** Prior 3F.1 uniform duration (kept for regression assertions). */
export const COMPACT_PHONE_TOUR_DURATION_S_3F1 = 11

export type CompactTourEasing = 'linear'

export type CompactTourSegment = {
  id: string
  durationMs: number
  fromProgress: number
  toProgress: number
  easing: CompactTourEasing
}

const R = MOBILE_APP_RANGES

/**
 * Temporal segments — event order matches desktop ranges.
 * Dash scroll duration preserved (~5.4s from 3F.1 linear map).
 * Day scroll expanded (~3.6s) + intro/end holds.
 */
export const COMPACT_PHONE_TOUR_SEGMENTS: readonly CompactTourSegment[] = [
  {
    id: 'dashBreath',
    durationMs: 330,
    fromProgress: R.dashBreath.start,
    toProgress: R.dashBreath.end,
    easing: 'linear',
  },
  {
    id: 'dashScroll',
    durationMs: 5400,
    fromProgress: R.dashScroll.start,
    toProgress: R.dashScroll.end,
    easing: 'linear',
  },
  {
    id: 'dashEndHold',
    durationMs: 500,
    fromProgress: R.dashEndHold.start,
    toProgress: R.dashEndHold.end,
    easing: 'linear',
  },
  {
    id: 'handoff',
    durationMs: 600,
    fromProgress: R.handoff.start,
    toProgress: R.handoff.end,
    easing: 'linear',
  },
  {
    id: 'dayIntroHold',
    durationMs: 750,
    fromProgress: R.dayHold.start,
    toProgress: R.dayHold.end,
    easing: 'linear',
  },
  {
    id: 'dayScroll',
    durationMs: 3600,
    fromProgress: R.dayScroll.start,
    toProgress: R.dayScroll.end,
    easing: 'linear',
  },
  {
    id: 'dayEndHold',
    durationMs: 650,
    fromProgress: R.dayEndHold.start,
    toProgress: R.dayEndHold.end,
    easing: 'linear',
  },
  {
    id: 'mapIn',
    durationMs: 600,
    fromProgress: R.mapIn.start,
    toProgress: R.mapIn.end,
    easing: 'linear',
  },
  {
    id: 'navRest',
    durationMs: 700,
    fromProgress: R.navRest.start,
    toProgress: R.navRest.end,
    easing: 'linear',
  },
  {
    id: 'routeTravel',
    durationMs: 2500,
    fromProgress: R.routeTravel.start,
    toProgress: R.routeTravel.end,
    easing: 'linear',
  },
  {
    id: 'arriveHold',
    durationMs: 700,
    fromProgress: R.arriveHold.start,
    toProgress: R.arriveHold.end,
    easing: 'linear',
  },
  {
    id: 'briefEnter',
    durationMs: 600,
    fromProgress: R.briefEnter.start,
    toProgress: R.briefEnter.end,
    easing: 'linear',
  },
  {
    id: 'briefHold',
    durationMs: 1500,
    fromProgress: R.briefHold.start,
    toProgress: R.briefHold.end,
    easing: 'linear',
  },
] as const

export const COMPACT_PHONE_TOUR_DURATION_MS = COMPACT_PHONE_TOUR_SEGMENTS.reduce(
  (sum, s) => sum + s.durationMs,
  0,
)

/** Total autonomous tour duration in seconds (master animation). */
export const COMPACT_PHONE_TOUR_DURATION_S = COMPACT_PHONE_TOUR_DURATION_MS / 1000

export function compactTourSegmentById(id: string): CompactTourSegment | undefined {
  return COMPACT_PHONE_TOUR_SEGMENTS.find((s) => s.id === id)
}

/** Map elapsed tour time (ms) → desktop-equivalent appProgress 0→1. */
export function appProgressAtTourElapsedMs(elapsedMs: number): number {
  const t = Math.max(0, elapsedMs)
  if (t >= COMPACT_PHONE_TOUR_DURATION_MS) return 1
  let rem = t
  for (const seg of COMPACT_PHONE_TOUR_SEGMENTS) {
    if (rem <= seg.durationMs) {
      const u = seg.durationMs <= 0 ? 1 : rem / seg.durationMs
      return seg.fromProgress + u * (seg.toProgress - seg.fromProgress)
    }
    rem -= seg.durationMs
  }
  return 1
}

/** Map normalized master time 0→1 → desktop appProgress. */
export function appProgressAtTourNormalized(t01: number): number {
  return appProgressAtTourElapsedMs(Math.min(1, Math.max(0, t01)) * COMPACT_PHONE_TOUR_DURATION_MS)
}

/** 3F.1 uniform mapping duration for a desktop progress span (regression). */
export function uniformMappedDurationS(from: number, to: number, totalS = COMPACT_PHONE_TOUR_DURATION_S_3F1): number {
  return Math.max(0, to - from) * totalS
}
