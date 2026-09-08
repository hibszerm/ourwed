/**
 * Marketing phone — canonical logical app viewport (Iteration 3F.3).
 *
 * Real CRM mobile layout assumes a full-bleed phone (~390 CSS px).
 * The landing phone screen is smaller (~76.5vw); without a logical viewport
 * the demo reflows at ~260–300px and cards/typography inflate.
 */

/** Matches common iPhone logical width + CRM mobile design reference. */
export const CANONICAL_APP_VIEWPORT_WIDTH_PX = 390

/** Compact phone outer width target from 3F.2 (frozen). */
export const COMPACT_PHONE_OUTER_VW = 76.5

/**
 * Chassis inset is calc(10/430 * 100cqw) of phone outer width.
 * Screen content ≈ outer * (1 - 2*10/430).
 */
export const PHONE_CHASSIS_INSET_FRACTION = 10 / 430

/** Estimate physical screen content width for a given phone outer width. */
export function estimatePhysicalScreenContentWidth(phoneOuterWidthPx: number): number {
  return phoneOuterWidthPx * (1 - 2 * PHONE_CHASSIS_INSET_FRACTION)
}

export function presentationScaleForPhysicalWidth(physicalScreenWidthPx: number): number {
  const w = Math.max(1, physicalScreenWidthPx)
  return w / CANONICAL_APP_VIEWPORT_WIDTH_PX
}

export function logicalViewportHeightFromPhysical(
  physicalScreenHeightPx: number,
  scale: number,
): number {
  const s = Math.max(0.01, scale)
  return physicalScreenHeightPx / s
}
