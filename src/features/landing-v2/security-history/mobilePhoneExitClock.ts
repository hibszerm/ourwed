/**
 * Legacy module clocks — NO LONGER drive phone→lock morph.
 * Morph is MobileStory-owned via postBriefProgress.
 * Kept as no-op clear so any stale imports cannot kill the phone.
 */

import { motionValue, type MotionValue } from 'framer-motion'

/** Idle stubs — must remain at identity so accidental subscribers cannot hide the phone. */
export const phoneSecurityShrinkMv: MotionValue<number> = motionValue(1)
export const phoneSecurityCompressMv: MotionValue<number> = motionValue(0)
export const phoneSecurityBriefMv: MotionValue<number> = motionValue(1)
export const phoneSecurityChromeMv: MotionValue<number> = motionValue(1)
export const phoneSecurityScreenMergeMv: MotionValue<number> = motionValue(0)
export const phoneSecurityShackleMv: MotionValue<number> = motionValue(0)
export const phoneSecurityKeyholeMv: MotionValue<number> = motionValue(0)
/** Intentionally unused for morph — leave must not control HeroPhoneFrame. */
export const phoneSecurityLeaveMv: MotionValue<number> = motionValue(0)

export const mobilePhoneShrinkMv = phoneSecurityShrinkMv
export const mobilePhoneExitMv = phoneSecurityLeaveMv

/** No-op: Security must not publish phone morph. */
export function publishPhoneSecurityMorph(): void {
  /* disconnected */
}

export function clearPhoneSecurityMorph(): void {
  phoneSecurityShrinkMv.set(1)
  phoneSecurityCompressMv.set(0)
  phoneSecurityBriefMv.set(1)
  phoneSecurityChromeMv.set(1)
  phoneSecurityScreenMergeMv.set(0)
  phoneSecurityShackleMv.set(0)
  phoneSecurityKeyholeMv.set(0)
  phoneSecurityLeaveMv.set(0)
}

export function publishMobilePhoneShrinkT(): void {
  /* disconnected */
}

export function publishMobilePhoneExitT(): void {
  /* disconnected — leave must not hide the real phone */
}

export function clearMobilePhoneExitT(): void {
  clearPhoneSecurityMorph()
}
