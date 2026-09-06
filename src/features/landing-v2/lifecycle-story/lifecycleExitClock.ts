/**
 * Lifecycle chapter clocks for Product exit + Features compact handoff.
 *
 * Published by LandingV2LifecycleStory (scroll → rAF).
 * - lifecycleExitMv → Product Story exit-only translate/scale
 * - lifecycleProgressMv → Features compact intro overlap (heading/lead)
 * Does NOT modify scene07HandoffMv or Product entrance choreography.
 */

import { motionValue, type MotionValue } from 'framer-motion'

/** 0 = Product iPad fully settled; 1 = fully exited above viewport. */
export const lifecycleExitMv: MotionValue<number> = motionValue(0)

/**
 * Full Lifecycle track progress 0→1 (same raw value as sticky data-lifecycle-progress).
 * Compact Features intro is keyed to this so heading/workspace share one overlap window.
 */
export const lifecycleProgressMv: MotionValue<number> = motionValue(0)

export function publishLifecycleExitT(t: number): void {
  lifecycleExitMv.set(Math.min(1, Math.max(0, t)))
}

export function publishLifecycleProgressT(t: number): void {
  lifecycleProgressMv.set(Math.min(1, Math.max(0, t)))
}

export function clearLifecycleExitT(): void {
  lifecycleExitMv.set(0)
}

export function clearLifecycleProgressT(): void {
  lifecycleProgressMv.set(0)
}
