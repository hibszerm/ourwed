/**
 * V6-F1.4 — PlanCompletenessChecker
 * Answers: DID WE EXECUTE THE PLAN? (not: did Luna understand the user?)
 *
 * Numeric AGGREGATE output requires AggregateObservation from the planned
 * aggregate step — collection totalCount / preview must NOT authorize it.
 */

import type { V6Observation } from '../observations/adapt'
import type {
  V6ExecutedStepRecord,
  V6PlanCompletenessResult,
  V6TurnPlan,
} from './types'

export function checkPlanCompleteness(input: {
  plan: V6TurnPlan
  executed: V6ExecutedStepRecord[]
  aggregateByStepId: Record<string, V6Observation>
}): V6PlanCompletenessResult {
  const { plan, executed, aggregateByStepId } = input

  if (
    plan.output.kind === 'CLARIFICATION' ||
    plan.output.kind === 'UNSUPPORTED'
  ) {
    return { ok: true, authorizingObservation: null }
  }

  const byId = new Map(executed.map((e) => [e.stepId, e]))
  const missing: string[] = []

  for (const step of plan.steps) {
    const rec = byId.get(step.id)
    if (!rec || !rec.ok) missing.push(step.id)
  }
  if (missing.length) {
    return {
      ok: false,
      code: 'PLAN_INCOMPLETE',
      detail: `missing_or_failed_steps:${missing.join(',')}`,
      missingStepIds: missing,
    }
  }

  if (plan.output.kind === 'AGGREGATE') {
    const obs = aggregateByStepId[plan.output.fromStep]
    if (!obs) {
      return {
        ok: false,
        code: 'MISSING_AGGREGATE_OBSERVATION',
        detail: `no_aggregate_observation_for:${plan.output.fromStep}`,
        missingStepIds: [plan.output.fromStep],
      }
    }
    if (obs.kind !== 'count_result' && obs.kind !== 'money_aggregate') {
      return {
        ok: false,
        code: 'MISSING_AGGREGATE_OBSERVATION',
        detail: 'authorizing_observation_not_aggregate',
        missingStepIds: [plan.output.fromStep],
      }
    }
    // Explicit: collection_result.totalCount must never authorize aggregate output
    return { ok: true, authorizingObservation: obs }
  }

  if (plan.output.kind === 'COLLECTION') {
    const rec = byId.get(plan.output.fromStep)
    const obs = rec?.observation
    if (!obs || obs.kind !== 'collection_result') {
      return {
        ok: false,
        code: 'MISSING_COLLECTION_OBSERVATION',
        detail: `no_collection_observation_for:${plan.output.fromStep}`,
        missingStepIds: [plan.output.fromStep],
      }
    }
    return { ok: true, authorizingObservation: obs }
  }

  return {
    ok: false,
    code: 'PLAN_INCOMPLETE',
    detail: 'unknown_output_kind',
    missingStepIds: [],
  }
}
