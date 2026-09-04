/**
 * Mobile Story clocks — theater (Features→phone) + in-phone app scrub.
 */

import { motionValue, type MotionValue } from 'framer-motion'

/** 0 = Features dominant; 1 = phone theater fully through old track. */
export const mobileStoryProgressMv: MotionValue<number> = motionValue(0)

/** 0 = phone just settled / dashboard start; 1 = Brief PDF hold. */
export const mobileAppProgressMv: MotionValue<number> = motionValue(0)

export function publishMobileStoryProgress(t: number): void {
  mobileStoryProgressMv.set(Math.min(1, Math.max(0, t)))
}

export function publishMobileAppProgress(t: number): void {
  mobileAppProgressMv.set(Math.min(1, Math.max(0, t)))
}

export function clearMobileStoryProgress(): void {
  mobileStoryProgressMv.set(0)
  mobileAppProgressMv.set(0)
}
