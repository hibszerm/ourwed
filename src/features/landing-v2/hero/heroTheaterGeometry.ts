/**
 * Hero scroll-theater motion ranges.
 * Desktop values are frozen; compact only shortens travel for narrow stages
 * and strengthens late exit overscan for portrait viewports.
 */

export type HeroTheaterGeometry = {
  /** Assemble product rise (px) — keyframes aligned to assembleProgress times. */
  productY: [number, number, number, number]
  productScale: [number, number, number]
  copyY: [number, number]
  nearestY: [number, number]
  upcomingY: [number, number]
  moduleY: [number, number]
  shellY: [number, number]
  greetingY: [number, number]
  /** Cover-scale clamp after screen→viewport measure. */
  coverScaleMin: number
  coverScaleMax: number
  coverScaleSafety: number
  /**
   * Compact portrait only — multiply stickyH / fittedTabletH so chassis
   * top+bottom clear the stage. Unused on desktop.
   */
  exitVerticalOverscan: number
}

export const HERO_THEATER_GEOMETRY_DESKTOP: HeroTheaterGeometry = {
  productY: [360, 220, 10, 0],
  productScale: [0.978, 0.992, 1],
  copyY: [0, -40],
  nearestY: [72, 0],
  upcomingY: [22, 0],
  moduleY: [22, 0],
  shellY: [24, 0],
  greetingY: [20, 0],
  coverScaleMin: 1.55,
  coverScaleMax: 2.45,
  coverScaleSafety: 1.22,
  exitVerticalOverscan: 1,
}

/** Tighter travel for phone sticky stages — same progress map, less px. */
export const HERO_THEATER_GEOMETRY_COMPACT: HeroTheaterGeometry = {
  productY: [168, 96, 6, 0],
  productScale: [0.985, 0.995, 1],
  copyY: [0, -22],
  nearestY: [40, 0],
  upcomingY: [14, 0],
  moduleY: [14, 0],
  shellY: [14, 0],
  greetingY: [12, 0],
  coverScaleMin: 2.2,
  /* Portrait phones need ~3.5–4× to clear landscape chassis vertically */
  coverScaleMax: 4.25,
  coverScaleSafety: 1.18,
  exitVerticalOverscan: 1.14,
}

export function heroTheaterGeometry(isCompactViewport: boolean): HeroTheaterGeometry {
  return isCompactViewport ? HERO_THEATER_GEOMETRY_COMPACT : HERO_THEATER_GEOMETRY_DESKTOP
}

/**
 * Compact portrait exit target: scale fitted tablet until its height
 * overshoots the sticky stage (top + bottom chassis leave the viewport).
 */
export function compactHeroExitCoverScale(input: {
  stickyHeight: number
  fittedTabletHeight: number
  overscan: number
  min: number
  max: number
}): number {
  const { stickyHeight, fittedTabletHeight, overscan, min, max } = input
  if (fittedTabletHeight < 40 || stickyHeight < 40) return min
  const required = (stickyHeight / fittedTabletHeight) * overscan
  return Math.min(max, Math.max(min, required))
}
