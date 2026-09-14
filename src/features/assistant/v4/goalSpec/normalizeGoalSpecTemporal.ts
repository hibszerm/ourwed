/**
 * G8 — Deterministic temporal normalization for GoalSpec.
 * Uses shared product calendar SoT (dates.ts) — not G8 phrase heuristics.
 * Resolves temporal.expression → resolvedRange when possible.
 */

import { resolveAggregateDateRange } from '../../dates'
import type { GoalSpec } from './goalSpec'

export function normalizeGoalSpecTemporal(
  goal: GoalSpec,
  todayLocalDateKey?: string,
): GoalSpec {
  if (!goal.temporal?.expression) return goal
  if (goal.temporal.resolvedRange) return goal
  if (goal.temporal.dateDimensionAmbiguous) return goal

  const range = resolveAggregateDateRange(
    goal.temporal.expression,
    todayLocalDateKey,
  )
  if (!range) return goal

  return {
    ...goal,
    temporal: {
      ...goal.temporal,
      resolvedRange: { from: range.from, to: range.to },
      // Wedding collection slice default when not ambiguous
      dateDimension: goal.temporal.dateDimension ?? 'wedding.date',
      dateDimensionAmbiguous: false,
    },
  }
}
