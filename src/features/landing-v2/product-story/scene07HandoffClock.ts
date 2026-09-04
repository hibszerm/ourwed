/**
 * Scene 07 → Product handoff clock.
 *
 * Single rAF-aligned MotionValue published by Problem Story measure,
 * consumed by Product Story transforms — same delivery pattern as Hero
 * `progress` → `useTransform(scale)` (no getComputedStyle round-trip).
 *
 * CSS `--lv2-scene07-handoff` remains for non-Motion consumers (tests / CSS).
 * Mathematical mapping is unchanged; only the delivery path.
 */

import { motionValue, type MotionValue } from 'framer-motion'

const SCENE07_HANDOFF_CSS_VAR = '--lv2-scene07-handoff'

/** Shared handoff clock 0→1. Full float precision (not CSS toFixed). */
export const scene07HandoffMv: MotionValue<number> = motionValue(0)

export function publishScene07HandoffT(t: number): void {
  const next = Math.min(1, Math.max(0, t))
  scene07HandoffMv.set(next)
  if (typeof document === 'undefined') return
  /* CSS keeps 4dp for stylesheet consumers; MotionValue keeps full float. */
  document.documentElement.style.setProperty(
    SCENE07_HANDOFF_CSS_VAR,
    next.toFixed(4),
  )
}

export function clearPublishedScene07HandoffT(): void {
  scene07HandoffMv.set(0)
  if (typeof document === 'undefined') return
  document.documentElement.style.removeProperty(SCENE07_HANDOFF_CSS_VAR)
}
