/**
 * Mobile feature-card demo geometry — Iteration 3E.2.
 *
 * Trigger = illustration-center CROSSING a reading line while moving upward
 * (forward page reading). Occupancy of a narrow IO band is NOT used.
 *
 * Forward document scroll (scrollY ↑): card anchor moves up → PLAY once.
 * Backward document scroll (scrollY ↓): card anchor moves down → RESET/PREPARE.
 */

/** Reading line as ratio of stable layout viewport height (from top). */
export const FEATURE_DEMO_READING_LINE = 0.75

/**
 * Visual REST only after the anchor is safely below the primary reading area
 * (so the user does not watch the illustration snap back mid-screen).
 */
export const FEATURE_DEMO_RESET_BELOW = 0.95

/**
 * REST — mobile rest visuals, ready to play on next forward crossing.
 * SETTLED — demo has played; keep end look while nearby.
 * RESET_ARMED — crossed reading line downward; keep end look until safely below.
 */
export type MobileFeatureDemoPhase = 'rest' | 'settled' | 'reset_armed'

export type FeatureDemoSample = {
  phase: MobileFeatureDemoPhase
  /** Previous anchor Y / viewportH, or null before first sample. */
  prevRatio: number | null
  playCount: number
}

export type FeatureDemoStepResult = FeatureDemoSample & {
  /** True only when this sample fired a new demo. */
  played: boolean
}

export function featureDemoCenterRatio(
  anchorCenterY: number,
  viewportHeight: number,
): number {
  if (viewportHeight <= 0) return 0
  return anchorCenterY / viewportHeight
}

/** Anchor moving up across the line: below → above (forward page reading). */
export function crossedReadingLineForward(
  prevRatio: number,
  currRatio: number,
  line = FEATURE_DEMO_READING_LINE,
): boolean {
  return prevRatio > line && currRatio <= line
}

/** Anchor moving down across the line: above → below (backward page reading). */
export function crossedReadingLineBackward(
  prevRatio: number,
  currRatio: number,
  line = FEATURE_DEMO_READING_LINE,
): boolean {
  return prevRatio < line && currRatio >= line
}

export function featureDemoDataAttr(
  phase: MobileFeatureDemoPhase,
): 'rest' | 'done' {
  return phase === 'rest' ? 'rest' : 'done'
}

export function createFeatureDemoSample(
  phase: MobileFeatureDemoPhase = 'rest',
): FeatureDemoSample {
  return { phase, prevRatio: null, playCount: 0 }
}

/**
 * Pure crossing machine — sparse-sample safe.
 *
 * 0.86 → 0.67 still plays (jumped the old 72–78 band).
 * 0.60 → 0.88 never plays (backward).
 */
export function stepFeatureDemo(
  sample: FeatureDemoSample,
  currRatio: number,
): FeatureDemoStepResult {
  const { prevRatio, phase, playCount } = sample

  if (prevRatio === null) {
    return {
      phase,
      prevRatio: currRatio,
      playCount,
      played: false,
    }
  }

  const forward = crossedReadingLineForward(prevRatio, currRatio)
  const backward = crossedReadingLineBackward(prevRatio, currRatio)

  let nextPhase = phase
  let nextPlay = playCount
  let played = false

  if (forward && phase === 'rest') {
    nextPhase = 'settled'
    nextPlay = playCount + 1
    played = true
  } else if (backward && (phase === 'settled' || phase === 'reset_armed')) {
    nextPhase = 'reset_armed'
  }

  /* Visual reset only once safely below the reading area. */
  if (
    (nextPhase === 'reset_armed' || nextPhase === 'settled') &&
    currRatio >= FEATURE_DEMO_RESET_BELOW
  ) {
    nextPhase = 'rest'
  }

  return {
    phase: nextPhase,
    prevRatio: currRatio,
    playCount: nextPlay,
    played,
  }
}

/**
 * Toolbar / layout-viewport noise: ignore samples when height jitter is
 * within the stable-viewport noise band and absolute Y barely moved.
 * Prevents false direction flips from Safari chrome.
 */
export function shouldIgnoreFeatureDemoSample(opts: {
  prevY: number | null
  currY: number
  prevH: number | null
  currH: number
  heightNoisePx?: number
  minMovePx?: number
}): boolean {
  const {
    prevY,
    currY,
    prevH,
    currH,
    heightNoisePx = 56,
    minMovePx = 2,
  } = opts
  if (prevY === null || prevH === null) return false
  const dH = Math.abs(currH - prevH)
  const dY = Math.abs(currY - prevY)
  if (dH > 0 && dH < heightNoisePx && dY < minMovePx + dH) {
    return true
  }
  if (dH === 0 && dY < minMovePx) return true
  return false
}
