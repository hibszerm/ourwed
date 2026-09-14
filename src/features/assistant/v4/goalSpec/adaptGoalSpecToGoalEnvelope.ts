/**
 * S4A — Pure Legacy GoalSpec → GoalEnvelope adapter.
 *
 * Typed fields only. No NL, no unsupportedReason routing, no context/registry.
 *
 * Eligibility (fail-closed):
 *   QueryGoal ⇔ requestKind === 'domain_query'
 *
 * Aggregation/measure/source alone do NOT override unsupported|clarification.
 * That would recreate U4.7 as a relocated heuristic (forbidden in S4A).
 */

import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import type { GoalAggregation, GoalSpec } from './goalSpec'
import type {
  GoalEnvelope,
  NonQueryGoal,
  QueryGoal,
  SlotState,
} from './goalEnvelope'

function measureSlot(goal: GoalSpec): SlotState<SemanticFieldId> {
  if (goal.measure != null) {
    return { status: 'resolved', value: goal.measure }
  }
  const amb = goal.ambiguities.find((a) => a.slot === 'measure')
  if (amb) {
    const candidates = (amb.candidates ?? [])
      .map((c) => c.id)
      .filter((id): id is SemanticFieldId => typeof id === 'string')
    return candidates.length > 0
      ? { status: 'ambiguous', candidates }
      : { status: 'ambiguous' }
  }
  return { status: 'missing' }
}

function aggregationSlot(
  goal: GoalSpec,
): SlotState<Exclude<GoalAggregation, null>> {
  if (goal.aggregation == null) return { status: 'missing' }
  return { status: 'resolved', value: goal.aggregation }
}

function sourceSlot(goal: GoalSpec): QueryGoal['source'] {
  if (goal.source == null) return { status: 'missing' }
  return { status: 'resolved', value: goal.source }
}

function toQueryGoal(goal: GoalSpec): QueryGoal {
  return {
    kind: 'query',
    source: sourceSlot(goal),
    aggregation: aggregationSlot(goal),
    measure: measureSlot(goal),
    temporal: goal.temporal
      ? {
          ...goal.temporal,
          resolvedRange: goal.temporal.resolvedRange
            ? { ...goal.temporal.resolvedRange }
            : null,
        }
      : null,
    relations: goal.relations.map((r) => ({
      ...r,
      ambiguousKinds: r.ambiguousKinds ? [...r.ambiguousKinds] : undefined,
      value:
        r.value && typeof r.value === 'object' && 'text' in r.value
          ? { ...r.value }
          : r.value,
    })),
    orderBy: goal.orderBy.map((o) => ({ ...o })),
    groupBy: [...goal.groupBy],
    targets: [...goal.targets],
    dialogue: goal.dialogue,
    inheritance: goal.inheritance ? { ...goal.inheritance } : null,
    correction: goal.correction ? { ...goal.correction } : null,
  }
}

function toNonQuery(
  kind: NonQueryGoal['kind'],
  topicKey: string | null,
): NonQueryGoal {
  return { kind, topicKey }
}

/**
 * Adapt Legacy GoalSpec → GoalEnvelope.
 * Does not mutate input. Does not use conversation context.
 */
export function adaptGoalSpecToGoalEnvelope(goal: GoalSpec): GoalEnvelope {
  // Structural family gate — requestKind is the only safe exclusive family tag
  // on the current Luna contract. Do not promote unsupported/clarification via
  // aggregation/measure heuristics (that is U4.7 relocated).
  if (goal.requestKind === 'domain_query') {
    return toQueryGoal(goal)
  }
  if (goal.requestKind === 'clarification') {
    return toNonQuery('legacy_clarification_kind', goal.topicKey)
  }
  if (goal.requestKind === 'prepare_action') {
    return toNonQuery('prepare_action', goal.topicKey)
  }
  if (goal.requestKind === 'product_help') {
    return toNonQuery('product_help', goal.topicKey)
  }
  if (goal.requestKind === 'goal_plan') {
    return toNonQuery('goal_plan', goal.topicKey)
  }
  // unsupported (and any unknown) — fail closed
  return toNonQuery('unsupported', goal.topicKey)
}
