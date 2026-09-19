/**
 * V6-F1.4 — Parse strict TurnPlan wire JSON → typed runtime plan.
 */

import {
  mapNativeQueryArgs,
  mapNativeTransformArgs,
} from '../agent/mapNativeToolArgs'
import { parseWeddingPlaceDetailSelector } from '../detail/weddingPlaceDetail'
import {
  ALL_RELATION_KEYS,
  getConcept,
  isConceptKey,
  resolveAggregateConcept,
  type ConceptKey,
  type RelationKey,
} from '../registry'
import type {
  V6TurnPlan,
  V6TurnPlanOutput,
  V6TurnPlanStep,
} from './types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Steps reachable from output.from_step via input_from_step links.
 * Unreachable steps are planner padding (strict schema requires nullable
 * bags on every step, so unused AGGREGATE_COLLECTION rows often arrive with
 * aggregation:null and would fail parse). Prune before field validation.
 *
 * When output has no from_step (CLARIFICATION / UNSUPPORTED), keep every
 * listed step so invalid leftover ops still fail closed.
 */
function reachableStepIdsFromOutput(
  rawSteps: unknown[],
  fromStep: string | null,
): Set<string> | 'all' {
  if (!fromStep) return 'all'
  const byId = new Map<string, Record<string, unknown>>()
  for (const step of rawSteps) {
    if (!isPlainObject(step)) continue
    if (typeof step.id !== 'string' || !step.id.trim()) continue
    byId.set(step.id, step)
  }
  const needed = new Set<string>()
  const stack = [fromStep]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (needed.has(id)) continue
    needed.add(id)
    const step = byId.get(id)
    if (!step) continue
    if (typeof step.input_from_step === 'string' && step.input_from_step.trim()) {
      stack.push(step.input_from_step)
    }
  }
  return needed
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

  const outputFromStep =
    typeof raw.output.from_step === 'string' && raw.output.from_step.trim()
      ? raw.output.from_step
      : null
  const reachable = reachableStepIdsFromOutput(raw.steps, outputFromStep)

  const steps: V6TurnPlanStep[] = []
  for (let i = 0; i < raw.steps.length; i++) {
    const s = raw.steps[i]
    if (!isPlainObject(s)) {
      return { ok: false, detail: `step_${i}_not_object` }
    }
    if (typeof s.id !== 'string' || !s.id.trim()) {
      return { ok: false, detail: `step_${i}_bad_id` }
    }
    if (reachable !== 'all' && !reachable.has(s.id)) {
      // Unreachable padding — drop (do not fail the whole plan).
      continue
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
        typeof s.measure === 'string' && resolveAggregateConcept(s.measure)
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

    if (kind === 'INSPECT_WEDDING') {
      if (!inputFromStep && !inputHandle) {
        return { ok: false, detail: `step_${s.id}_inspect_input_required` }
      }
      const sel = parseWeddingPlaceDetailSelector(s.detail_selector)
      if (!sel.ok) {
        return { ok: false, detail: `step_${s.id}_${sel.detail}` }
      }
      steps.push({
        id: s.id,
        kind: 'INSPECT_WEDDING',
        inputFromStep,
        inputHandle,
        detailSelector: sel.selector,
      })
      continue
    }

    if (kind === 'INSPECT_RESOURCE') {
      if (!inputFromStep && !inputHandle) {
        return { ok: false, detail: `step_${s.id}_inspect_input_required` }
      }
      if (
        !Array.isArray(s.inspect_concepts) ||
        s.inspect_concepts.length < 1 ||
        s.inspect_concepts.length > 6
      ) {
        return { ok: false, detail: `step_${s.id}_inspect_concepts_required` }
      }
      const concepts: ConceptKey[] = []
      for (const concept of s.inspect_concepts) {
        if (
          !isConceptKey(concept) ||
          !(getConcept(concept).operations as readonly string[]).includes(
            'inspect',
          )
        ) {
          return {
            ok: false,
            detail: `step_${s.id}_concept_not_inspectable:${String(concept)}`,
          }
        }
        concepts.push(concept)
      }
      steps.push({
        id: s.id,
        kind: 'INSPECT_RESOURCE',
        inputFromStep,
        inputHandle,
        concepts,
      })
      continue
    }

    if (kind === 'LIST_RELATED') {
      if (!inputFromStep && !inputHandle) {
        return { ok: false, detail: `step_${s.id}_related_input_required` }
      }
      if (
        typeof s.relation !== 'string' ||
        !ALL_RELATION_KEYS.includes(s.relation as RelationKey)
      ) {
        return { ok: false, detail: `step_${s.id}_relation_required` }
      }
      const limit =
        s.relation_limit === null || s.relation_limit === undefined
          ? null
          : typeof s.relation_limit === 'number' &&
              Number.isInteger(s.relation_limit) &&
              s.relation_limit > 0
            ? s.relation_limit
            : undefined
      if (limit === undefined) {
        return { ok: false, detail: `step_${s.id}_relation_limit_invalid` }
      }
      steps.push({
        id: s.id,
        kind: 'LIST_RELATED',
        inputFromStep,
        inputHandle,
        relation: s.relation as RelationKey,
        limit,
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
  } else if (out.kind === 'DETAIL') {
    if (typeof out.from_step !== 'string' || !out.from_step.trim()) {
      return { ok: false, detail: 'output_detail_from_step_required' }
    }
    output = { kind: 'DETAIL', fromStep: out.from_step }
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
