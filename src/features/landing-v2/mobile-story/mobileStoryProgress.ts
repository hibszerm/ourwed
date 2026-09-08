/**
 * Landing V2 Mobile Story — scroll progress ranges (0→1 theater track).
 *
 * Theater sequence (unchanged): Features exit → headline → phone settle.
 * In-phone app story uses a separate app progress after phone settles —
 * see app/motion/mobileAppStoryProgress.ts.
 */

export const MOBILE_TRACK_PRE_SVH = 260
export const MOBILE_TRACK_APP_SVH = 420
/** Total sticky track — pre (approved) + app story extension (dash + post). */
export const MOBILE_TRACK_SVH = MOBILE_TRACK_PRE_SVH + MOBILE_TRACK_APP_SVH

export const MOBILE_RANGES = {
  /** Features grid yields gradually — headline resolves underneath. */
  featuresExit: { start: 0.04, end: 0.34 },
  /** Headline emerges while Features still visibly present. */
  headlineIn: { start: 0.06, end: 0.26 },
  /** Brief reading pause on sharp two-line headline. */
  headlineHold: { start: 0.26, end: 0.34 },
  /** Two lines separate quickly for phone opening. */
  headlineSep: { start: 0.34, end: 0.52 },
  /** Headline fades out — must reach 0 before phone settles. */
  headlineExit: { start: 0.46, end: 0.62 },
  /** Phone scales / rises into settled geometry. */
  phoneIn: { start: 0.42, end: 0.74 },
  /** Clean phone-only hold. */
  phoneHold: { start: 0.74, end: 1.0 },
} as const

export function rangeT(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0
  return Math.min(1, Math.max(0, (p - start) / (end - start)))
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) ** 3
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/** Piecewise linear keyframes — calm handoff curves without spring physics. */
export function keyframeLerp(p: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (points.length === 0) return 0
  if (p <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    if (p <= x1) {
      const t = (p - x0) / (x1 - x0)
      return y0 + (y1 - y0) * t
    }
  }
  return points[points.length - 1][1]
}

export function featuresOpacityAt(p: number): number {
  return keyframeLerp(p, [
    [0, 1],
    [0.1, 0.92],
    [0.18, 0.72],
    [0.24, 0.48],
    [0.3, 0.2],
    [0.34, 0],
  ])
}

export function featuresYAt(p: number): number {
  return keyframeLerp(p, [
    [0, 0],
    [0.1, -20],
    [0.18, -70],
    [0.24, -125],
    [0.3, -185],
    [0.34, -230],
  ])
}

export function featuresBlurPxAt(p: number): number {
  return keyframeLerp(p, [
    [0, 0],
    [0.1, 0.3],
    [0.18, 1.5],
    [0.24, 3],
    [0.3, 5],
    [0.34, 7],
  ])
}

export function featuresScaleAt(p: number): number {
  return keyframeLerp(p, [
    [0, 1],
    [0.34, 0.985],
  ])
}

/** @deprecated — use featuresOpacityAt for handoff */
export function featuresExitT(p: number): number {
  return easeInOutCubic(rangeT(p, MOBILE_RANGES.featuresExit.start, MOBILE_RANGES.featuresExit.end))
}

export function headlineEnterOpacityAt(p: number): number {
  return keyframeLerp(p, [
    [0.06, 0],
    [0.1, 0.15],
    [0.16, 0.45],
    [0.22, 0.78],
    [0.26, 1],
  ])
}

/** Authoritative headline visibility — entrance × hold × exit. Zero from phone hold onward. */
export function headlineCompositeOpacityAt(p: number): number {
  return keyframeLerp(p, [
    [0.06, 0],
    [0.1, 0.15],
    [0.16, 0.45],
    [0.22, 0.78],
    [0.26, 1],
    [0.34, 1],
    [0.44, 0.55],
    [0.54, 0.15],
    [0.62, 0],
    [1, 0],
  ])
}

export function headlineEnterBlurPxAt(p: number): number {
  return keyframeLerp(p, [
    [0.06, 10],
    [0.1, 8],
    [0.16, 5],
    [0.22, 2],
    [0.26, 0],
  ])
}

export function headlineExitBlurPxAt(p: number): number {
  return keyframeLerp(p, [
    [MOBILE_RANGES.headlineExit.start, 0],
    [MOBILE_RANGES.headlineExit.end, 6],
    [1, 6],
  ])
}

export function headlineEnterYAt(p: number): number {
  return keyframeLerp(p, [
    [0.06, 30],
    [0.1, 24],
    [0.16, 15],
    [0.22, 6],
    [0.26, 0],
  ])
}

export function headlineInT(p: number): number {
  return easeOutCubic(rangeT(p, MOBILE_RANGES.headlineIn.start, MOBILE_RANGES.headlineIn.end))
}

export function headlineSepT(p: number): number {
  return easeOutCubic(rangeT(p, MOBILE_RANGES.headlineSep.start, MOBILE_RANGES.headlineSep.end))
}

/** Base desktop sep travel (px per line). Compact applies HEADLINE_SEP_COMPACT_SCALE. */
export const HEADLINE_SEP_PX = 155
/** Extra drift through headline exit (desktop). Compact uses a smaller multiplier. */
export const HEADLINE_SEP_EXIT_DRIFT_PX = 30

/**
 * Compact editorial sep — softer than desktop.
 * Target visual_px / scroll_px ≈ 0.45 on the sep window (see 3F acceptance).
 */
export const HEADLINE_SEP_COMPACT_SCALE = 90 / HEADLINE_SEP_PX

export function headlineSepYAt(
  p: number,
  opts: { linear?: boolean; exitDriftPx?: number } = {},
): number {
  const { start, end } = MOBILE_RANGES.headlineSep
  const raw = rangeT(p, start, end)
  const sepT = opts.linear ? raw : easeOutCubic(raw)
  const sepEnd = sepT * HEADLINE_SEP_PX
  if (p <= end) return sepEnd
  const drift = opts.exitDriftPx ?? HEADLINE_SEP_EXIT_DRIFT_PX
  const exitT = rangeT(p, end, MOBILE_RANGES.headlineExit.end)
  return sepEnd + exitT * drift
}

/** Theater progress span of the sep window (for ratio tests). */
export function headlineSepProgressSpan(): number {
  return MOBILE_RANGES.headlineSep.end - MOBILE_RANGES.headlineSep.start
}

/**
 * visual_px / scroll_px for compact sep peak travel over the sep progress window.
 * scroll ≈ span * preTravel; visual = HEADLINE_SEP_PX * HEADLINE_SEP_COMPACT_SCALE.
 */
export function compactHeadlineSepRatio(preTravelPx: number): number {
  const scroll = headlineSepProgressSpan() * Math.max(1, preTravelPx)
  const visual = HEADLINE_SEP_PX * HEADLINE_SEP_COMPACT_SCALE
  return visual / scroll
}

/** @deprecated — use headlineCompositeOpacityAt */
export function headlineSepOpacityFactorAt(p: number): number {
  const composite = headlineCompositeOpacityAt(p)
  const enter = headlineEnterOpacityAt(p)
  return enter > 0.001 ? composite / enter : 0
}

export function phoneInT(p: number): number {
  return easeOutCubic(rangeT(p, MOBILE_RANGES.phoneIn.start, MOBILE_RANGES.phoneIn.end))
}

export function phoneSettled(p: number): boolean {
  return p >= MOBILE_RANGES.phoneHold.start - 0.002
}

/** Dead-zone guard: both layers faint simultaneously during Features→headline handoff. */
export function isHandoffDeadZone(featuresOpacity: number, headlineOpacity: number): boolean {
  return featuresOpacity < 0.2 && headlineOpacity < 0.4
}

/** Progress at which a keyframed opacity curve crosses a target (for QA reports). */
export function progressAtOpacity(
  opacityAt: (p: number) => number,
  target: number,
  start = 0,
  end = 1,
  step = 0.001,
): number {
  for (let p = start; p <= end; p += step) {
    if (opacityAt(p) <= target) return Math.round(p * 1000) / 1000
  }
  return end
}
