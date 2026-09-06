/**
 * Lifecycle chapter exit clock for the settled Product Story iPad.
 *
 * Published by LandingV2LifecycleStory (scroll → rAF).
 * Consumed by Product Story for exit-only translate/scale —
 * does NOT modify scene07HandoffMv or Product entrance choreography.
 */

import { motionValue, type MotionValue } from 'framer-motion'

/** 0 = Product iPad fully settled; 1 = fully exited above viewport. */
export const lifecycleExitMv: MotionValue<number> = motionValue(0)

export function publishLifecycleExitT(t: number): void {
  lifecycleExitMv.set(Math.min(1, Math.max(0, t)))
}

export function clearLifecycleExitT(): void {
  lifecycleExitMv.set(0)
}
