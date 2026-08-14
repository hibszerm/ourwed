/**
 * Finance page-entry motion — local presentation tokens only.
 * Rhythm tuned for legato overlap (second physical recording review).
 */

/** Smoothstep — balanced mid progression (avoids easeOutCubic “race then crawl”). */
export function financeSmoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/**
 * Total page-entry window until lower content is settled.
 * Shorter decisive finish (~1.35s) with denser overlap than sequential staging.
 */
export const FINANCE_ENTRANCE_DONE_MS = 1360

/** KPI / summary count-up (desktop). */
export const FINANCE_COUNT_MS = 900

/** KPI / summary count-up (mobile). */
export const FINANCE_COUNT_MS_MOBILE = 760

/**
 * KPI counters wait for card structure (~50ms), then tiny organic offsets.
 * Values are absolute delays from play start.
 */
export const FINANCE_KPI_COUNT_DELAYS_MS = [50, 70, 90, 105] as const

/**
 * Summary syncs with chart start — not a separate counter act.
 * Absolute delays from play start.
 */
export const FINANCE_SUMMARY_COUNT_DELAYS_MS = {
  primary: 260,
  paid: 285,
  remaining: 305,
} as const

/**
 * Compressed active-month stagger — texture, not staircase (~110ms spread).
 */
export const FINANCE_BAR_STAGGER_DESKTOP_MS = [
  0, 28, 50, 72, 92, 110, 124, 134, 142, 148, 150, 150,
] as const

/** Mobile active-month stagger — tighter (~80ms). */
export const FINANCE_BAR_STAGGER_MOBILE_MS = [
  0, 16, 30, 42, 52, 62, 70, 76, 80, 80, 80, 80,
] as const

export function financeActiveBarDelayMs(
  activeIndex: number,
  isMobile: boolean,
): number {
  const table = isMobile
    ? FINANCE_BAR_STAGGER_MOBILE_MS
    : FINANCE_BAR_STAGGER_DESKTOP_MS
  const i = Math.min(Math.max(0, activeIndex), table.length - 1)
  return table[i] ?? 0
}

export function financeIsMobileViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
  )
}
