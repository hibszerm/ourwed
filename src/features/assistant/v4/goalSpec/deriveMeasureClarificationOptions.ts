/**
 * U2 — Derive legal measure clarification options from field registry.
 * Deterministic. No LLM. No user-text inspection.
 */

import {
  SEMANTIC_FIELD_IDS,
  SEMANTIC_FIELD_REGISTRY,
  type SemanticFieldId,
} from '../domainQuery/fieldRegistry'
import type { GoalSpec } from './goalSpec'
import {
  measureLabelKeyForField,
  type ClarificationLabelKey,
} from './goalClarificationCopy'
import type { GoalClarificationOption } from './goalClarificationTypes'

export type DeriveMeasureOptionsResult =
  | { status: 'not_applicable' }
  | { status: 'unsupported'; reason: string }
  | { status: 'auto_resolve'; measure: SemanticFieldId }
  | { status: 'clarify'; options: GoalClarificationOption[] }

/**
 * Wedding G7 slice: money fields that support sum aggregation.
 */
export function deriveWeddingSumMeasureCandidates(
  allowlist?: readonly SemanticFieldId[],
): SemanticFieldId[] {
  const ids = allowlist ?? SEMANTIC_FIELD_IDS
  const out: SemanticFieldId[] = []
  for (const id of ids) {
    const def = SEMANTIC_FIELD_REGISTRY[id]
    if (!def) continue
    if (def.entity !== 'wedding') continue
    if (def.valueType !== 'money') continue
    if (!def.aggregateOperators.includes('sum')) continue
    out.push(id)
  }
  return out
}

function toOptions(ids: SemanticFieldId[]): GoalClarificationOption[] {
  const options: GoalClarificationOption[] = []
  for (const id of ids) {
    const labelKey: ClarificationLabelKey | null = measureLabelKeyForField(id)
    if (!labelKey) continue
    options.push({ id, value: id, labelKey })
  }
  return options
}

/**
 * Decide measure clarification from GoalSpec shape + registry.
 * `candidateOverride` is for deterministic tests of 0/1-candidate branches only.
 */
export function deriveMeasureClarificationOptions(
  goal: GoalSpec,
  candidateOverride?: readonly SemanticFieldId[],
): DeriveMeasureOptionsResult {
  if (goal.requestKind !== 'domain_query') {
    return { status: 'not_applicable' }
  }
  if (goal.aggregation !== 'sum') {
    return { status: 'not_applicable' }
  }
  if (goal.measure != null) {
    return { status: 'not_applicable' }
  }
  if (goal.source != null && goal.source !== 'wedding') {
    return {
      status: 'unsupported',
      reason: `source_${goal.source}_not_in_g7_slice`,
    }
  }

  const candidates = deriveWeddingSumMeasureCandidates(candidateOverride)
  if (candidates.length === 0) {
    return { status: 'unsupported', reason: 'no_legal_measure_candidates' }
  }
  if (candidates.length === 1) {
    return { status: 'auto_resolve', measure: candidates[0]! }
  }
  return { status: 'clarify', options: toOptions(candidates) }
}
