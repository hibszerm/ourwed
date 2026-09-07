/**
 * Compact Product tablet exit — Iteration 3C.2.
 *
 * BEFORE (ed16b94 / CompactProductReveal):
 *   lifecycleExitMv = easeInOutCubic(rangeT(master, 0, 0.12))
 *   y = exitT * vh * -1.1
 *   On ~874 CSS viewport / Lifecycle ~320svh:
 *     exit scroll ≈ 0.12 * stickyTravel ≈ 239px
 *     tablet travel ≈ 874 * 1.1 ≈ 961px
 *     ratio ≈ 4.0 (+ easeInOutCubic)
 *   AND Product sticky already unpins ≈ when Lifecycle pins (native 1:1),
 *   so the transform stacked on document motion → perceived jump.
 *
 * AFTER:
 *   No scroll-driven translateY / scale on compact Product.
 *   Tablet leaves via sticky unpin → browser-native document scroll (ratio 1.0).
 */

/** Documented BEFORE geometry for acceptance tests (~874 CSS viewport). */
export const COMPACT_PRODUCT_EXIT_BEFORE_SCROLL_PX = 239
export const COMPACT_PRODUCT_EXIT_BEFORE_TRAVEL_PX = 961
export const COMPACT_PRODUCT_EXIT_BEFORE_RATIO =
  COMPACT_PRODUCT_EXIT_BEFORE_TRAVEL_PX / COMPACT_PRODUCT_EXIT_BEFORE_SCROLL_PX

export const COMPACT_PRODUCT_EXIT_RATIO = 1

/** Travel to clear sticky stage once unpinned (px). */
export function compactProductExitTravelPx(stickyH: number): number {
  return Math.max(1, Math.round(stickyH))
}

/**
 * Native sticky exit: CSS px the sticky has moved up past pin (navH).
 * stickyTop === navH → 0 (still pinned)
 * stickyTop === navH - d → d (unpinned, scrolling with document)
 */
export function compactProductNativeExitScrollPx(
  stickyTop: number,
  navH: number,
): number {
  return Math.max(0, navH - stickyTop)
}

/**
 * Viewport-relative tablet displacement from native sticky release.
 * Equal to -exitScrollPx (1:1 with document).
 */
export function compactProductNativeExitY(
  stickyTop: number,
  navH: number,
  exitTravelPx: number,
): number {
  const scrolled = Math.min(
    exitTravelPx,
    compactProductNativeExitScrollPx(stickyTop, navH),
  )
  return -scrolled * COMPACT_PRODUCT_EXIT_RATIO
}

/** Ratio sample: elementΔ / scrollΔ for native unpin (must be ≈ 1). */
export function compactProductExitMotionRatio(
  sampleScrollPx = 100,
  exitTravelPx = 800,
): number {
  const navH = 68
  const a = compactProductNativeExitY(navH, navH, exitTravelPx)
  const b = compactProductNativeExitY(navH - sampleScrollPx, navH, exitTravelPx)
  return (a - b) / sampleScrollPx
}

export function compactProductExitOpacity(
  stickyTop: number,
  navH: number,
  exitTravelPx: number,
): number {
  const scrolled = compactProductNativeExitScrollPx(stickyTop, navH)
  const t = Math.min(1, scrolled / Math.max(1, exitTravelPx))
  if (t < 0.92) return 1
  return 1 - ((t - 0.92) / 0.08) * 0.04
}

export function compactProductExitPhase(
  stickyTop: number,
  navH: number,
  exitTravelPx: number,
): 'idle' | 'active' | 'done' {
  const scrolled = compactProductNativeExitScrollPx(stickyTop, navH)
  if (scrolled <= 0.5) return 'idle'
  if (scrolled >= exitTravelPx - 0.5) return 'done'
  return 'active'
}
