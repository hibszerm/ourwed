/**
 * Stable layout viewport helpers — Iteration 3E.
 *
 * iOS Safari toolbar collapse/expand changes `window.innerHeight` and
 * `visualViewport.height` during normal scroll. Theater geometry and CSS
 * scroll-timeline ranges must NOT recompute on those transient changes.
 *
 * Prefer `documentElement.clientHeight` (layout viewport ≈ svh) and only
 * accept height deltas above a toolbar-noise threshold.
 */

/** Ignore Safari chrome height noise during scroll. */
export const LANDING_VIEWPORT_HEIGHT_NOISE_PX = 56

export function landingLayoutViewportSize(): { w: number; h: number } {
  if (typeof document === 'undefined') {
    return { w: 390, h: 844 }
  }
  const el = document.documentElement
  return {
    w: el.clientWidth || window.innerWidth || 390,
    h: el.clientHeight || window.innerHeight || 844,
  }
}

/**
 * Returns true when a geometry recompute is warranted (width change or
 * significant height change — not toolbar animation).
 */
export function landingViewportGeometryChanged(
  prev: { w: number; h: number } | null,
  next: { w: number; h: number },
  heightNoisePx = LANDING_VIEWPORT_HEIGHT_NOISE_PX,
): boolean {
  if (!prev) return true
  if (Math.abs(next.w - prev.w) >= 1) return true
  if (Math.abs(next.h - prev.h) >= heightNoisePx) return true
  return false
}
