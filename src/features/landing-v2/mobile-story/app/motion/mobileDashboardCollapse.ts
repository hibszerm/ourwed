/**
 * Landing Mobile Story — Dashboard scroll / compact-bar mapping.
 * Compact bar mirrors production MobileNextAssignmentBar (binary reveal under sticky header),
 * driven by deterministic scroll progress instead of IntersectionObserver.
 */

import { easeOutCubic, rangeT } from '@/features/landing-v2/mobile-story/mobileStoryProgress'
import {
  MOBILE_APP_RANGES,
  dashOpacityAt,
  dashScrollYAt,
  weddingOpenAt,
} from '@/features/landing-v2/mobile-story/app/motion/mobileAppStoryProgress'
import { dashboardMaxScrollMv } from '@/features/landing-v2/mobile-story/app/motion/mobileDashboardScrollGeometry'

/** Sentinel crosses sticky header after ~hero height (production 10px sentinel under hero). */
export const DASH_COMPACT_ENTER_PX = 148
/** Soft crossfade window so bar appears before hero fully leaves the viewport. */
export const DASH_COMPACT_FADE_PX = 36

/** When measured maxScroll is shorter than the production hero, scale the enter threshold. */
export function compactEnterPxForMaxScroll(maxScroll: number): number {
  if (maxScroll <= 0) return DASH_COMPACT_ENTER_PX
  return Math.min(DASH_COMPACT_ENTER_PX, Math.max(48, maxScroll * 0.72))
}

/**
 * Compact glass bar opacity — production is binary+CSS transition;
 * progress maps a short crossfade for deterministic scrubbing.
 */
export function compactBarOpacityAt(app: number, maxScroll = dashboardMaxScrollMv.get()): number {
  const enter = compactEnterPxForMaxScroll(maxScroll)
  const fade = Math.min(DASH_COMPACT_FADE_PX, Math.max(12, enter * 0.25))
  const scrolled = Math.abs(dashScrollYAt(app, maxScroll))
  const raw = Math.min(1, Math.max(0, (scrolled - (enter - fade)) / fade))
  const dashVisible = dashOpacityAt(app) * (weddingOpenAt(app) < 0.55 ? 1 : 0)
  return easeOutCubic(raw) * dashVisible
}

/** How far through dashScroll the compact bar is fully on (for tests). */
export function compactBarSettledAppProgress(maxScroll = dashboardMaxScrollMv.get()): number {
  const max = Math.max(1, maxScroll)
  const need = Math.min(1, compactEnterPxForMaxScroll(max) / max)
  const r = MOBILE_APP_RANGES.dashScroll
  return r.start + need * (r.end - r.start)
}

export function dashScrollProgressAt(app: number): number {
  return rangeT(app, MOBILE_APP_RANGES.dashScroll.start, MOBILE_APP_RANGES.dashScroll.end)
}
