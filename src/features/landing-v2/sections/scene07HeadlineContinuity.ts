/**
 * Scene 07 headline continuity helpers (pure — no React / CSS).
 * Used by acceptance tests to guard against sticky→portal remount flash.
 */

import { easeOutCubic } from '@/features/landing-v2/product-story/productStoryProgress'

/** Relative scroll weights — must match LandingV2ProblemStory.tsx */
const SCENE_WEIGHTS = [0.42, 0.7, 0.7, 0.8, 1.0, 0.9, 1.35] as const
const SCENE_ENTER_SCALE = 0.995
/** Pin lead — must match LandingV2ProblemStory SCENE07_PIN_LEAD */
export const SCENE07_PIN_LEAD = 0.012

function buildSceneRanges(weights: readonly number[]) {
  const sum = weights.reduce((a, b) => a + b, 0)
  const ranges: Array<{
    inStart: number
    inEnd: number
    holdStart: number
    holdEnd: number
    outStart: number
    outEnd: number
  }> = []
  let cursor = 0
  const usable = 0.998
  for (let i = 0; i < weights.length; i++) {
    const span = (weights[i]! / sum) * usable
    const inFrac = i === 0 ? 0.05 : 0.2
    const holdFrac = i === 0 ? 0.45 : i === weights.length - 1 ? 0.52 : 0.8
    const inStart = cursor
    const inEnd = cursor + span * inFrac
    const holdStart = inEnd
    const holdEnd = cursor + span * holdFrac
    const outStart = holdEnd
    const outEnd = cursor + span
    ranges.push({ inStart, inEnd, holdStart, holdEnd, outStart, outEnd })
    cursor = outEnd
  }
  return ranges
}

const SCENE_RANGES = buildSceneRanges(SCENE_WEIGHTS)

export function getScene07Range() {
  return SCENE_RANGES[6]!
}

/** Discrete portal/fixed pin — MUST only flip while Scene 07 effective opacity ≈ 0. */
export function scene07PinActive(storyP: number): boolean {
  const r = getScene07Range()
  return storyP >= r.inStart - SCENE07_PIN_LEAD
}

/**
 * Effective Scene 07 headline visuals for continuity audits.
 * Base enter/hold stays opaque for the last scene; exit fade/scale/blur ride handoffT.
 */
export function scene07HeadlineVisualAt(storyP: number): {
  handoffT: number
  exitT: number
  baseOpacity: number
  opacity: number
  scale: number
  blurPx: number
  pinned: boolean
  visible: boolean
} {
  const r = getScene07Range()
  const p = Math.min(1, Math.max(0, storyP))
  const handoffT = Math.min(
    1,
    Math.max(0, (p - r.outStart) / Math.max(0.0001, r.outEnd - r.outStart)),
  )
  const exitT = easeOutCubic(handoffT)

  let baseOpacity = 0
  if (p >= r.inEnd) baseOpacity = 1
  else if (p > r.inStart) {
    baseOpacity = (p - r.inStart) / Math.max(0.0001, r.inEnd - r.inStart)
  }

  let baseScale = SCENE_ENTER_SCALE
  if (p >= r.inEnd) baseScale = 1
  else if (p > r.inStart) {
    const t = (p - r.inStart) / Math.max(0.0001, r.inEnd - r.inStart)
    baseScale = SCENE_ENTER_SCALE + (1 - SCENE_ENTER_SCALE) * t
  }

  const opacity = baseOpacity * (1 - exitT)
  /* Matches s6ExitScale: [0,1] → [1, 2.15] ⇒ multiplier 1 + exitT * 1.15 */
  const scale = baseScale * (1 + exitT * 1.15)
  const blurPx = exitT * 25
  const pinned = scene07PinActive(p)
  return {
    handoffT,
    exitT,
    baseOpacity,
    opacity,
    scale,
    blurPx,
    pinned,
    visible: opacity > 0.02,
  }
}
