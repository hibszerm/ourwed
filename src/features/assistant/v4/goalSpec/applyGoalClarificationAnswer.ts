/**
 * S2 — Deterministic one-slot GoalSpec patch from typed clarification answer.
 *
 * Ownership:
 * - Clarification patches ONLY the answered slot (+ that slot's resolution metadata).
 * - Context-derived facts (e.g. source from measure registry) belong on BoundGoal,
 *   not as writeback into GoalSpec.
 *
 * Never mutates the pending snapshot in place. Never calls the interpreter.
 * Never inspects display labels.
 */

import {
  getSemanticField,
  isSemanticFieldId,
  type SemanticFieldId,
} from '../domainQuery/fieldRegistry'
import type { GoalSpec, NamedEntityKindHint } from './goalSpec'
import type {
  ApplyGoalClarificationResult,
  GoalClarificationAnswer,
  GoalClarificationRequest,
  GoalClarificationValue,
} from './goalClarificationTypes'

/** Host/UI-reachable clarification slots with typed apply support. */
export const GOAL_CLARIFICATION_PATCH_SLOTS = [
  'measure',
  'entity_kind',
  'date_dimension',
] as const

export type GoalClarificationPatchSlot =
  (typeof GOAL_CLARIFICATION_PATCH_SLOTS)[number]

export function isGoalClarificationPatchSlot(
  slot: string,
): slot is GoalClarificationPatchSlot {
  return (GOAL_CLARIFICATION_PATCH_SLOTS as readonly string[]).includes(slot)
}

function cloneGoal(goal: GoalSpec): GoalSpec {
  return {
    ...goal,
    targets: [...goal.targets],
    orderBy: [...goal.orderBy],
    groupBy: [...goal.groupBy],
    relations: goal.relations.map((r) => ({
      ...r,
      ambiguousKinds: r.ambiguousKinds ? [...r.ambiguousKinds] : undefined,
      value:
        r.value && typeof r.value === 'object' && 'text' in r.value
          ? { ...r.value }
          : r.value,
    })),
    aspects: [...goal.aspects],
    ambiguities: goal.ambiguities.map((a) => ({ ...a })),
    correction: goal.correction ? { ...goal.correction } : null,
    inheritance: goal.inheritance ? { ...goal.inheritance } : null,
    temporal: goal.temporal
      ? {
          ...goal.temporal,
          resolvedRange: goal.temporal.resolvedRange
            ? { ...goal.temporal.resolvedRange }
            : null,
        }
      : null,
  }
}

function clearSlotAmbiguity(goal: GoalSpec, slot: GoalClarificationPatchSlot): void {
  goal.ambiguities = goal.ambiguities.filter((a) => a.slot !== slot)
}

function patchMeasure(goal: GoalSpec, value: GoalClarificationValue): boolean {
  if (!isSemanticFieldId(value)) return false
  goal.measure = value
  clearSlotAmbiguity(goal, 'measure')
  return true
}

function patchDateDimension(
  goal: GoalSpec,
  value: GoalClarificationValue,
): boolean {
  if (!isSemanticFieldId(value)) return false
  const def = getSemanticField(value)
  if (!def?.isDateDimension) return false
  goal.temporal = {
    expression: goal.temporal?.expression ?? null,
    resolvedRange: goal.temporal?.resolvedRange
      ? { ...goal.temporal.resolvedRange }
      : null,
    dateDimension: value as SemanticFieldId,
    dateDimensionAmbiguous: false,
  }
  clearSlotAmbiguity(goal, 'date_dimension')
  return true
}

/**
 * Patch NamedEntityRef.kindHint / clear multi-kind dispute only.
 * Does not set source, invent relations, or change measure/aggregation.
 */
function patchEntityKind(
  goal: GoalSpec,
  value: GoalClarificationValue,
): boolean {
  if (typeof value !== 'string' || value.length === 0) return false
  for (const rel of goal.relations) {
    if ((rel.ambiguousKinds?.length ?? 0) > 1) {
      rel.ambiguousKinds = undefined
      if (rel.value && typeof rel.value === 'object' && 'text' in rel.value) {
        rel.value = {
          ...rel.value,
          kindHint: value as NamedEntityKindHint,
        }
      }
    }
  }
  clearSlotAmbiguity(goal, 'entity_kind')
  return true
}

/**
 * Apply a typed clarification answer as a one-slot semantic patch.
 */
export function applyGoalClarificationAnswer(
  request: GoalClarificationRequest,
  answer: GoalClarificationAnswer,
): ApplyGoalClarificationResult {
  if (answer.clarificationId !== request.id) {
    return { ok: false, reason: 'stale_clarification_id' }
  }
  if (answer.slot !== request.slot) {
    return { ok: false, reason: 'slot_mismatch' }
  }
  if (!isGoalClarificationPatchSlot(request.slot)) {
    return { ok: false, reason: 'unsupported_slot' }
  }
  const allowed = request.options.some((o) => o.value === answer.selectedValue)
  if (!allowed) {
    return { ok: false, reason: 'invalid_selected_value' }
  }

  const goal = cloneGoal(request.pendingGoal)

  let ok = false
  if (request.slot === 'measure') {
    ok = patchMeasure(goal, answer.selectedValue)
  } else if (request.slot === 'date_dimension') {
    ok = patchDateDimension(goal, answer.selectedValue)
  } else if (request.slot === 'entity_kind') {
    ok = patchEntityKind(goal, answer.selectedValue)
  }

  if (!ok) {
    return { ok: false, reason: 'invalid_selected_value' }
  }

  return { ok: true, goal }
}
