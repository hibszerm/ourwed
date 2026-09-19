/**
 * V6-F1.4 — Derive operation classes from TurnPlan / executed steps.
 */

import type {
  V6ExecutedStepRecord,
  V6PlannedOpClass,
  V6TurnPlan,
  V6TurnPlanStep,
} from './types'
import type { V6FilterOp } from '../semantics/types'

export function plannedOpClassesFromPlan(plan: V6TurnPlan): V6PlannedOpClass[] {
  const ops = new Set<V6PlannedOpClass>()
  for (const step of plan.steps) {
    for (const c of plannedOpClassesFromStep(step)) ops.add(c)
  }
  return [...ops]
}

export function plannedOpClassesFromStep(
  step: V6TurnPlanStep,
): V6PlannedOpClass[] {
  if (step.kind === 'SEARCH_COLLECTION') {
    const out: V6PlannedOpClass[] = ['Search']
    if (step.search.relativeTemporal) out.push('Temporal')
    if (step.search.filters?.length) out.push('Filter')
    if (step.search.conceptFilters?.length) out.push('Filter')
    if (step.search.excludePlace) out.push('Exclude')
    if (step.search.sort) out.push('Sort')
    if (step.search.slice) out.push('Slice')
    return out
  }
  if (step.kind === 'TRANSFORM_COLLECTION') {
    return transformOpClasses(step.ops)
  }
  if (step.kind === 'AGGREGATE_COLLECTION') return ['Aggregate']
  if (step.kind === 'RESTORE_COLLECTION') return ['Restore']
  if (step.kind === 'INSPECT_WEDDING') return ['Inspect']
  if (step.kind === 'INSPECT_RESOURCE') return ['Inspect']
  if (step.kind === 'LIST_RELATED') return ['ListRelated']
  return []
}

function transformOpClasses(ops: V6FilterOp[]): V6PlannedOpClass[] {
  const out: V6PlannedOpClass[] = []
  for (const op of ops) {
    if (op.op === 'Filter') out.push('Filter')
    if (op.op === 'ConceptFilter') out.push('Filter')
    if (op.op === 'RelativeTemporal') out.push('Temporal')
    if (op.op === 'Sort') out.push('Sort')
    if (op.op === 'Slice') out.push('Slice')
    if (op.op === 'Exclude') out.push('Exclude')
  }
  return out
}

export function executedOpClassesFromRecords(
  records: V6ExecutedStepRecord[],
): V6PlannedOpClass[] {
  const ops = new Set<V6PlannedOpClass>()
  for (const r of records) {
    if (!r.ok) continue
    if (r.toolName === 'query_collection') {
      ops.add('Search')
      const a = r.toolArgs
      if (a.relativeTemporal) ops.add('Temporal')
      if (Array.isArray(a.filters) && a.filters.length) ops.add('Filter')
      if (Array.isArray(a.conceptFilters) && a.conceptFilters.length) {
        ops.add('Filter')
      }
      if (a.excludePlace) ops.add('Exclude')
      if (a.sort) ops.add('Sort')
      if (a.slice) ops.add('Slice')
    }
    if (r.toolName === 'transform_collection') {
      const list = Array.isArray(r.toolArgs.ops) ? (r.toolArgs.ops as V6FilterOp[]) : []
      for (const c of transformOpClasses(list)) ops.add(c)
    }
    if (r.toolName === 'aggregate_collection') ops.add('Aggregate')
    if (r.toolName === 'restore_collection') ops.add('Restore')
    if (r.toolName === 'inspect_wedding') ops.add('Inspect')
    if (r.toolName === 'inspect_resource') ops.add('Inspect')
    if (r.toolName === 'list_related') ops.add('ListRelated')
  }
  return [...ops]
}
