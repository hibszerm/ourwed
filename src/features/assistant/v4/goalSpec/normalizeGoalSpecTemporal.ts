/**
 * G8 / TR1 — Deterministic temporal normalization for GoalSpec.
 * Uses shared product calendar SoT (dates.ts) — not phrase heuristics.
 *
 * Resolves temporal.expression → resolvedRange ONLY when the shared
 * resolver returns a closed range that is whole-expression equivalent
 * to the typed closed period intent. Open / remainder / from-now /
 * before-after compounds stay meaning-only (unresolved) → SC1 incomplete.
 * Does not invent now/today operators from free text.
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
