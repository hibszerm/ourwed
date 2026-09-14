/**
 * V6-F1.4 — Parse strict TurnPlan wire JSON → typed runtime plan.
 */

import {
  mapNativeQueryArgs,
  mapNativeTransformArgs,
} from '../agent/mapNativeToolArgs'
import type {
  V6TurnPlan,
  V6TurnPlanOutput,
  V6TurnPlanStep,
} from './types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export type ParseTurnPlanResult =
  | { ok: true; plan: V6TurnPlan }
  | { ok: false; detail: string }

export function parseTurnPlanWire(raw: unknown): ParseTurnPlanResult {
  if (!isPlainObject(raw)) {
    return { ok: false, detail: 'turn_plan_must_be_object' }
  }
  if (!Array.isArray(raw.steps)) {
    return { ok: false, detail: 'steps_required' }
  }
  if (raw.steps.length > 6) {
    return { ok: false, detail: 'steps_max_exceeded' }
  }
  if (!isPlainObject(raw.output)) {
    return { ok: false, detail: 'output_required' }
  }

  const steps: V6TurnPlanStep[] = []
  for (let i = 0; i < raw.steps.length; i++) {
    const s = raw.steps[i]
    if (!isPlainObject(s)) {
      return { ok: false, detail: `step_${i}_not_object` }
    }
    if (typeof s.id !== 'string' || !s.id.trim()) {
      return { ok: false, detail: `step_${i}_bad_id` }
    }
    const kind = s.kind
    const inputFromStep =
      typeof s.input_from_step === 'string' ? s.input_from_step : null
    const inputHandle =
      typeof s.input_handle === 'string' ? s.input_handle : null

    if (kind === 'SEARCH_COLLECTION') {
      if (!isPlainObject(s.search)) {
        return { ok: false, detail: `step_${s.id}_search_required` }
      }
      const mapped = mapNativeQueryArgs(s.search)
      if (!mapped.ok) {
        return { ok: false, detail: `step_${s.id}_${mapped.detail}` }
      }
      steps.push({ id: s.id, kind: 'SEARCH_COLLECTION', search: mapped.value })
      continue
    }

    if (kind === 'TRANSFORM_COLLECTION') {
      if (!Array.isArray(s.transform_ops) || s.transform_ops.length < 1) {
        return { ok: false, detail: `step_${s.id}_transform_ops_required` }
      }
      if (!inputFromStep && !inputHandle) {
        return { ok: false, detail: `step_${s.id}_transform_input_required` }
      }
      const mapped = mapNativeTransformArgs({
        parent_handle: inputHandle ?? '__from_step__',
        ops: s.transform_ops,
      })
      if (!mapped.ok) {
        return { ok: false, detail: `step_${s.id}_${mapped.detail}` }
      }
      steps.push({
        id: s.id,
        kind: 'TRANSFORM_COLLECTION',
        inputFromStep,
        inputHandle,
        ops: mapped.value.ops,
      })
      continue
    }

    if (kind === 'AGGREGATE_COLLECTION') {
      if (s.aggregation !== 'count' && s.aggregation !== 'sum') {
        return { ok: false, detail: `step_${s.id}_aggregation_required` }
      }
      if (!inputFromStep && !inputHandle) {
        return { ok: false, detail: `step_${s.id}_aggregate_input_required` }
      }
      const measure =
        s.measure === 'contract_value' ||
        s.measure === 'paid_amount' ||
        s.measure === 'remaining_amount'
          ? s.measure
          : null
      if (s.aggregation === 'sum' && !measure) {
        return { ok: false, detail: `step_${s.id}_sum_requires_measure` }
      }
      steps.push({
        id: s.id,
        kind: 'AGGREGATE_COLLECTION',
        inputFromStep,
        inputHandle,
        aggregation: s.aggregation,
        measure,
      })
      continue
    }

    if (kind === 'RESTORE_COLLECTION') {
      if (!inputHandle?.trim()) {
        return { ok: false, detail: `step_${s.id}_restore_handle_required` }
      }
      steps.push({
        id: s.id,
        kind: 'RESTORE_COLLECTION',
        inputHandle,
      })
      continue
    }

    return { ok: false, detail: `step_${i}_unknown_kind` }
  }

  const out = raw.output
  let output: V6TurnPlanOutput
  if (out.kind === 'COLLECTION') {
    if (typeof out.from_step !== 'string' || !out.from_step.trim()) {
      return { ok: false, detail: 'output_collection_from_step_required' }
    }
    output = { kind: 'COLLECTION', fromStep: out.from_step }
  } else if (out.kind === 'AGGREGATE') {
    if (typeof out.from_step !== 'string' || !out.from_step.trim()) {
      return { ok: false, detail: 'output_aggregate_from_step_required' }
    }
    output = { kind: 'AGGREGATE', fromStep: out.from_step }
  } else if (out.kind === 'CLARIFICATION') {
    if (typeof out.reason !== 'string' || !out.reason.trim()) {
      return { ok: false, detail: 'output_clarify_reason_required' }
    }
    output = {
      kind: 'CLARIFICATION',
      reason: out.reason,
      slot:
        typeof out.slot === 'string' && out.slot.trim()
          ? out.slot
          : 'unspecified',
    }
  } else if (out.kind === 'UNSUPPORTED') {
    if (typeof out.reason !== 'string' || !out.reason.trim()) {
      return { ok: false, detail: 'output_unsupported_reason_required' }
    }
    output = { kind: 'UNSUPPORTED', reason: out.reason }
  } else {
    return { ok: false, detail: 'output_unknown_kind' }
  }

  return { ok: true, plan: { steps, output } }
}
