/**
 * Mobile feature-card demo geometry — Iteration 3E.1.
 *
 * Activation is positional (reading zone ≈ 75% of stable viewport height),
 * not intersection-ratio. Reset uses hysteresis so tiny reversals do not replay.
 */

/** Nominal activation: card-center ratio from viewport top. */
export const FEATURE_DEMO_ACTIVATION_RATIO = 0.75

/** Inclusive activation band around the nominal point (72%–78%). */
export const FEATURE_DEMO_ACTIVATE_MIN = 0.72
export const FEATURE_DEMO_ACTIVATE_MAX = 0.78

/**
 * Reset only when the card center is clearly away from the readable viewport.
 * Above ≈ top fifth; below ≈ past the bottom edge.
 */
export const FEATURE_DEMO_RESET_ABOVE = 0.22
export const FEATURE_DEMO_RESET_BELOW = 1.1

export type MobileFeatureDemoPhase = 'rest' | 'active' | 'settled'

export function featureDemoCenterRatio(
  cardCenterY: number,
  viewportHeight: number,
): number {
  if (viewportHeight <= 0) return 0
  return cardCenterY / viewportHeight
}

export function isFeatureDemoActivationBand(
  cardCenterY: number,
  viewportHeight: number,
): boolean {
  const r = featureDemoCenterRatio(cardCenterY, viewportHeight)
  return r >= FEATURE_DEMO_ACTIVATE_MIN && r <= FEATURE_DEMO_ACTIVATE_MAX
}

export function isFeatureDemoResetZone(
  cardCenterY: number,
  viewportHeight: number,
): boolean {
  const r = featureDemoCenterRatio(cardCenterY, viewportHeight)
  return r < FEATURE_DEMO_RESET_ABOVE || r > FEATURE_DEMO_RESET_BELOW
}

/**
 * Pure phase machine — direction-independent.
 *
 * REST → ACTIVE when center enters 72–78% band.
 * ACTIVE/SETTLED → REST only in reset zones (hysteresis).
 * ACTIVE → SETTLED on any subsequent evaluation while still nearby
 * (CSS time-based animation continues independently).
 */
export function nextMobileFeatureDemoPhase(
  phase: MobileFeatureDemoPhase,
  cardCenterY: number,
  viewportHeight: number,
): MobileFeatureDemoPhase {
  if (phase === 'rest') {
    return isFeatureDemoActivationBand(cardCenterY, viewportHeight)
      ? 'active'
      : 'rest'
  }

  if (isFeatureDemoResetZone(cardCenterY, viewportHeight)) {
    return 'rest'
  }

  return 'settled'
}

/** DOM attr for CSS: rest vs demonstrated (active|settled share end look). */
export function featureDemoDataAttr(
  phase: MobileFeatureDemoPhase,
): 'rest' | 'done' {
  return phase === 'rest' ? 'rest' : 'done'
}
