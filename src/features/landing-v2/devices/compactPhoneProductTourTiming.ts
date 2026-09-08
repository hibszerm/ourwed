/**
 * Compact phone tour timing — Iteration 3F.2 (+ 3F.3 physical-speed compensation)
 *
 * Desktop MOBILE_APP_RANGES remain the visual choreography source of truth.
 * Autonomous playback uses bespoke segment durations (not linear time≡progress).
 *
 * 3F.2 wall-clock durations are the approved *perceived* physical speed baseline.
 * 3F.3 canonical 390 layout + static presentation scale shortens physical travel;
 * scroll/route segment ms are scaled so physical CSS px/s stays within ±5% of 3F.2.
 * Event order, holds, and handoff structure are unchanged.
 */

import { MOBILE_APP_RANGES } from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'

/** Calm beat after phone lands, before tour. */
export const COMPACT_PHONE_TOUR_SETTLE_DELAY_MS = 500

/** Prior 3F.1 uniform duration (kept for regression assertions). */
export const COMPACT_PHONE_TOUR_DURATION_S_3F1 = 11

/** Approved 3F.2 wall-clock baselines (before logical-viewport compensation). */
export const COMPACT_TOUR_3F2_DASH_SCROLL_MS = 5400
export const COMPACT_TOUR_3F2_DAY_SCROLL_MS = 3600
export const COMPACT_TOUR_3F2_ROUTE_TRAVEL_MS = 2500

/**
 * Measured @402×874 compact phone (physical travel AFTER÷BEFORE after 3F.3 viewport).
 * Durations *= ratio so physical px/s ≈ 3F.2.
 */
export const COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DASH = 0.5966
export const COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DAY = 0.5631
/** Fixed logical map deltas → physical shrink ≈ presentation scale. */
export const COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_ROUTE = 0.7513

export const COMPACT_TOUR_DASH_SCROLL_MS = Math.round(
  COMPACT_TOUR_3F2_DASH_SCROLL_MS * COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DASH,
)
export const COMPACT_TOUR_DAY_SCROLL_MS = Math.round(
  COMPACT_TOUR_3F2_DAY_SCROLL_MS * COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_DAY,
)
export const COMPACT_TOUR_ROUTE_TRAVEL_MS = Math.round(
  COMPACT_TOUR_3F2_ROUTE_TRAVEL_MS * COMPACT_TOUR_3F3_PHYS_TRAVEL_RATIO_ROUTE,
)

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
 * Holds/handoffs keep 3F.2 ms. Dash/Day/Route ms compensated for 3F.3 physical speed.
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
    durationMs: COMPACT_TOUR_DASH_SCROLL_MS,
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
    durationMs: COMPACT_TOUR_DAY_SCROLL_MS,
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
    durationMs: COMPACT_TOUR_ROUTE_TRAVEL_MS,
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
