/**
 * Hero scroll-theater motion ranges.
 * Desktop values are frozen; compact only shortens travel for narrow stages.
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
  coverScaleMin: 1.35,
  coverScaleMax: 2.15,
  coverScaleSafety: 1.18,
}

export function heroTheaterGeometry(isCompactViewport: boolean): HeroTheaterGeometry {
  return isCompactViewport ? HERO_THEATER_GEOMETRY_COMPACT : HERO_THEATER_GEOMETRY_DESKTOP
}
