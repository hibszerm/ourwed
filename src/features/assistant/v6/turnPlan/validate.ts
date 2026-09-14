/**
 * V6-F1.4 — Deterministic TurnPlan validation before any business execution.
 */

import type { V6TurnPlan, V6TurnPlanStep } from './types'

export type ValidateTurnPlanResult =
  | { ok: true }
  | {
      ok: false
      code: 'PLAN_VALIDATION_ERROR' | 'UNSUPPORTED_CAPABILITY'
      detail: string
    }

const COLLECTION_KINDS = new Set([
  'SEARCH_COLLECTION',
  'TRANSFORM_COLLECTION',
  'RESTORE_COLLECTION',
])

export function validateTurnPlan(plan: V6TurnPlan): ValidateTurnPlanResult {
  const ids = new Set<string>()
  for (const step of plan.steps) {
    if (ids.has(step.id)) {
      return {
        ok: false,
        code: 'PLAN_VALIDATION_ERROR',
        detail: `duplicate_step_id:${step.id}`,
      }
    }
    ids.add(step.id)
  }

  if (
    plan.output.kind === 'CLARIFICATION' ||
    plan.output.kind === 'UNSUPPORTED'
  ) {
    return { ok: true }
  }

  if (plan.steps.length === 0) {
    return {
      ok: false,
      code: 'PLAN_VALIDATION_ERROR',
      detail: 'empty_steps_for_data_output',
    }
  }

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!
    const prior = new Set(plan.steps.slice(0, i).map((s) => s.id))
    const refCheck = validateStepRefs(step, prior)
    if (!refCheck.ok) return refCheck
  }

  if (plan.output.kind === 'AGGREGATE') {
    const fromStep = plan.output.fromStep
    const target = plan.steps.find((s) => s.id === fromStep)
    if (!target) {
      return {
        ok: false,
        code: 'PLAN_VALIDATION_ERROR',
        detail: `output_from_step_unknown:${fromStep}`,
      }
    }
    if (target.kind !== 'AGGREGATE_COLLECTION') {
      return {
        ok: false,
        code: 'PLAN_VALIDATION_ERROR',
        detail: 'aggregate_output_requires_aggregate_step',
      }
    }
  }

  if (plan.output.kind === 'COLLECTION') {
    const fromStep = plan.output.fromStep
    const target = plan.steps.find((s) => s.id === fromStep)
    if (!target) {
      return {
        ok: false,
        code: 'PLAN_VALIDATION_ERROR',
        detail: `output_from_step_unknown:${fromStep}`,
      }
    }
    if (!COLLECTION_KINDS.has(target.kind)) {
      return {
        ok: false,
        code: 'PLAN_VALIDATION_ERROR',
        detail: 'collection_output_requires_collection_step',
      }
    }
  }

  return { ok: true }
}

function validateStepRefs(
  step: V6TurnPlanStep,
  priorIds: Set<string>,
): ValidateTurnPlanResult {
  if (step.kind === 'SEARCH_COLLECTION') return { ok: true }

  if (step.kind === 'RESTORE_COLLECTION') {
    if (!step.inputHandle.trim()) {
      return {
        ok: false,
        code: 'PLAN_VALIDATION_ERROR',
        detail: `restore_handle_missing:${step.id}`,
      }
    }
    return { ok: true }
  }

  if (step.inputFromStep) {
    if (!priorIds.has(step.inputFromStep)) {
      return {
        ok: false,
        code: 'PLAN_VALIDATION_ERROR',
        detail: `bad_step_ref:${step.id}->${step.inputFromStep}`,
      }
    }
    return { ok: true }
  }
  if (step.inputHandle) return { ok: true }
  return {
    ok: false,
    code: 'PLAN_VALIDATION_ERROR',
    detail: `missing_input:${step.id}`,
  }
}
