/** Motion constants for Landing V3 */

export const premiumEase: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Calm ease for opacity handoffs — no bounce. */
export const softEase: [number, number, number, number] = [0.33, 0, 0.2, 1]

export const DURATION = {
  micro: 0.2,
  control: 0.32,
  state: 0.32,
  panel: 0.55,
  scene: 0.8,
  shared: 0.9,
  heroMorph: 0.9,
} as const

/** Mobile product motion ~25% faster than desktop choreography. */
export const MOBILE_DURATION_SCALE = 0.75

export function mobileDuration(seconds: number): number {
  return seconds * MOBILE_DURATION_SCALE
}
