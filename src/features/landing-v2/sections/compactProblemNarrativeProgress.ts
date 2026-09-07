/**
 * Compact Problem Story — stacked statement narrative (Iteration 3B).
 *
 * Scroll progress is LINEAR (Founder cover-style 1:1 finger coupling).
 * Only translateY + opacity. No timers. Fully reversible.
 */

import { PROBLEM_STORY_SCENES } from '@/features/landing-v2/sections/problemStoryCopy'

export const COMPACT_NARRATIVE_STATEMENTS = PROBLEM_STORY_SCENES.map((s) => ({
  id: s.id,
  lines: s.lines,
}))

export const COMPACT_NARRATIVE_STATEMENT_COUNT =
  COMPACT_NARRATIVE_STATEMENTS.length

/** Equal scroll weight per statement handoff+hold. */
export const COMPACT_NARRATIVE_STATEMENT_WEIGHT = 1

/**
 * Clear / Product handoff weight after the last statement.
 * Shorter than a full statement beat — Founder-like cover release.
 */
export const COMPACT_NARRATIVE_CLEAR_WEIGHT = 0.9

/** Incoming travel occupies this fraction of each statement slot. */
export const COMPACT_NARRATIVE_ARRIVE_FRACTION = 0.7

/**
 * Previous statement begins fading once incoming local exceeds this
 * (final arrival band).
 */
export const COMPACT_NARRATIVE_OUTGOING_FADE_START = 0.55

/** First statement settle travel as a fraction of enterY (not a full fly-in). */
export const COMPACT_NARRATIVE_FIRST_Y_FRACTION = 0.14

export type CompactStatementVisual = {
  opacity: number
  /** 0 = reading position; 1 = one enterY below. */
  yUnit: number
  /** True when opacity/y need compositor work. */
  active: boolean
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

function linear(t: number, a: number, b: number): number {
  return clamp01((t - a) / Math.max(1e-6, b - a))
}

export function compactNarrativeTotalWeight(
  count = COMPACT_NARRATIVE_STATEMENT_COUNT,
  clearWeight = COMPACT_NARRATIVE_CLEAR_WEIGHT,
): number {
  return count * COMPACT_NARRATIVE_STATEMENT_WEIGHT + clearWeight
}

export function compactNarrativeSlotStart(
  index: number,
  count = COMPACT_NARRATIVE_STATEMENT_COUNT,
  clearWeight = COMPACT_NARRATIVE_CLEAR_WEIGHT,
): number {
  return (index * COMPACT_NARRATIVE_STATEMENT_WEIGHT) / compactNarrativeTotalWeight(count, clearWeight)
}

export function compactNarrativeSlotEnd(
  index: number,
  count = COMPACT_NARRATIVE_STATEMENT_COUNT,
  clearWeight = COMPACT_NARRATIVE_CLEAR_WEIGHT,
): number {
  return (
    ((index + 1) * COMPACT_NARRATIVE_STATEMENT_WEIGHT) /
    compactNarrativeTotalWeight(count, clearWeight)
  )
}

export function compactNarrativeClearStart(
  count = COMPACT_NARRATIVE_STATEMENT_COUNT,
  clearWeight = COMPACT_NARRATIVE_CLEAR_WEIGHT,
): number {
  return (
    (count * COMPACT_NARRATIVE_STATEMENT_WEIGHT) /
    compactNarrativeTotalWeight(count, clearWeight)
  )
}

/** Linear Product handoff during the clear tail — no easeOut acceleration. */
export function compactNarrativeHandoffT(
  p: number,
  count = COMPACT_NARRATIVE_STATEMENT_COUNT,
  clearWeight = COMPACT_NARRATIVE_CLEAR_WEIGHT,
): number {
  return linear(p, compactNarrativeClearStart(count, clearWeight), 1)
}

/**
 * Sticky stage opacity during clear — fades so the stable Product tablet shows.
 * Linear with handoff (Founder cover release feel).
 */
export function compactNarrativeStageOpacity(handoffT: number): number {
  return 1 - clamp01(handoffT)
}

export function statementVisualAt(
  p: number,
  index: number,
  count = COMPACT_NARRATIVE_STATEMENT_COUNT,
  clearWeight = COMPACT_NARRATIVE_CLEAR_WEIGHT,
): CompactStatementVisual {
  const slotStart = compactNarrativeSlotStart(index, count, clearWeight)
  const slotEnd = compactNarrativeSlotEnd(index, count, clearWeight)
  const arriveEnd =
    slotStart + (slotEnd - slotStart) * COMPACT_NARRATIVE_ARRIVE_FRACTION
  const incoming = linear(p, slotStart, arriveEnd)

  let opacity = 0
  let yUnit = index === 0 ? COMPACT_NARRATIVE_FIRST_Y_FRACTION : 1

  if (p < slotStart) {
    return {
      opacity: 0,
      yUnit,
      active: false,
    }
  }

  if (index === 0) {
    /* Gentle appear near the reading position — no aggressive fly-in. */
    yUnit = (1 - incoming) * COMPACT_NARRATIVE_FIRST_Y_FRACTION
    opacity = incoming
  } else if (incoming <= 0.6) {
    const travel = incoming / 0.6
    yUnit = 1 - travel
    opacity = Math.min(1, travel * 1.2)
  } else {
    yUnit = 0
    opacity = 1
  }

  if (p >= arriveEnd) {
    opacity = 1
    yUnit = 0
  }

  /* Outgoing fade while the next statement finishes arriving. */
  if (index < count - 1) {
    const nextStart = slotEnd
    const nextEnd = compactNarrativeSlotEnd(index + 1, count, clearWeight)
    const nextArriveEnd =
      nextStart + (nextEnd - nextStart) * COMPACT_NARRATIVE_ARRIVE_FRACTION
    const nextIncoming = linear(p, nextStart, nextArriveEnd)
    if (nextIncoming >= COMPACT_NARRATIVE_OUTGOING_FADE_START) {
      const fade = linear(
        nextIncoming,
        COMPACT_NARRATIVE_OUTGOING_FADE_START,
        1,
      )
      opacity *= 1 - fade
      yUnit -= fade * 0.06
    } else if (p >= nextStart) {
      /* Next is traveling; keep this statement fully readable until fade band. */
      opacity = 1
      yUnit = 0
    }
  }

  /* Last statement clears linearly into Product. */
  if (index === count - 1) {
    const clearT = compactNarrativeHandoffT(p, count, clearWeight)
    if (clearT > 0) {
      opacity *= 1 - clearT
      yUnit -= clearT * 0.1
    }
  }

  opacity = clamp01(opacity)
  const active = opacity > 0.008 || (yUnit > 0.01 && opacity > 0)
  return { opacity, yUnit, active }
}

/** Indices that may need transform/opacity work (max two). */
export function activeStatementIndices(
  p: number,
  count = COMPACT_NARRATIVE_STATEMENT_COUNT,
  clearWeight = COMPACT_NARRATIVE_CLEAR_WEIGHT,
): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    if (statementVisualAt(p, i, count, clearWeight).active) out.push(i)
  }
  return out.slice(0, 2)
}
