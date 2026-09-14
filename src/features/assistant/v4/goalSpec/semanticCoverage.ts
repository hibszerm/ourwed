/**
 * SC1 — Typed semantic coverage: GoalSpec material requirements vs executable DQ.
 *
 * Deterministic only. No utterance / phrase / LLM judge.
 * Fail closed when a represented material slot is not faithfully executable.
 *
 * LIMITATION: cannot detect meaning Luna never encoded into GoalSpec.
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { BoundGoal } from './boundGoal'
import type { GoalSpec } from './goalSpec'

export type SemanticCoverageReason =
  | 'groupby_not_executable'
  | 'orderby_not_preserved'
  | 'unsupported_aggregation'
  | 'aggregation_mismatch'
  | 'unresolved_temporal_intent'
  | 'temporal_range_mismatch'
  | 'unsupported_date_dimension'
  | 'unsupported_relation'
  | 'relation_mismatch'
  | 'measure_mismatch'
  | 'aspects_not_executable'
  | 'targets_not_executable'
  | 'source_mismatch'
  | 'limit_intent_not_executable'

export type SemanticCoverageResult =
  | { status: 'complete' }
  | { status: 'incomplete'; reasonCodes: SemanticCoverageReason[] }

const MONEY_MEASURES = new Set([
  'wedding.contract_value',
  'wedding.paid_amount',
  'wedding.remaining_amount',
])

const UNSUPPORTED_AGGREGATIONS = new Set([
  'avg',
  'rank',
  'group',
  'min',
  'max',
])

function pushUnique(
  codes: SemanticCoverageReason[],
  code: SemanticCoverageReason,
) {
  if (!codes.includes(code)) codes.push(code)
}

function placeNameFromGoal(goal: GoalSpec): string | null {
  for (const rel of goal.relations) {
    if (rel.relation !== 'place') continue
    if (rel.field !== 'place.name' && rel.field != null) continue
    const v = rel.value
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (
      v &&
      typeof v === 'object' &&
      'text' in v &&
      typeof (v as { text: unknown }).text === 'string'
    ) {
      const t = (v as { text: string }).text.trim()
      if (t) return t
    }
  }
  return null
}

function placeNameFromQuery(query: DomainQuery): string | null {
  const v = query.relations.find((r) => r.field === 'place.name')?.value
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/**
 * Compare material GoalSpec requirements to BoundGoal (optional) + DomainQuery.
 */
export function assessSemanticCoverage(input: {
  goalSpec: GoalSpec
  boundGoal?: BoundGoal | null
  domainQuery: DomainQuery
}): SemanticCoverageResult {
  const { goalSpec: goal, domainQuery: query } = input
  const codes: SemanticCoverageReason[] = []

  if (goal.requestKind !== 'domain_query') {
    // Non-query families are not IC1 authority material; treat as incomplete
    // if somehow assessed on a DomainQuery path.
    pushUnique(codes, 'unsupported_aggregation')
    return { status: 'incomplete', reasonCodes: codes }
  }

  // --- Aggregation families not in IC1 executable slice ---
  if (goal.aggregation && UNSUPPORTED_AGGREGATIONS.has(goal.aggregation)) {
    pushUnique(codes, 'unsupported_aggregation')
  }

  if (goal.groupBy.length > 0) {
    pushUnique(codes, 'groupby_not_executable')
  }

  // BoundGoal currently wipes orderBy; any GoalSpec orderBy is material loss.
  if (goal.orderBy.length > 0) {
    pushUnique(codes, 'orderby_not_preserved')
  }

  // Top-N / explicit limit is meaning-only until DomainQuery executes it.
  if (goal.limit != null) {
    pushUnique(codes, 'limit_intent_not_executable')
  }

  // Conservative: aspects / non-inheritance targets imply projection not executed by IC1 DQ.
  // active_collection is the typed inherit signal for IC1 follow-ups — not an unexecuted projection.
  if (goal.aspects.length > 0) {
    pushUnique(codes, 'aspects_not_executable')
  }
  const nonInheritanceTargets = goal.targets.filter(
    (t) => t.kind !== 'active_collection',
  )
  if (nonInheritanceTargets.length > 0) {
    pushUnique(codes, 'targets_not_executable')
  }

  // --- Temporal ---
  const expr =
    typeof goal.temporal?.expression === 'string'
      ? goal.temporal.expression.trim()
      : ''
  const explicitRange = goal.temporal?.resolvedRange ?? null

  if (expr && !explicitRange) {
    pushUnique(codes, 'unresolved_temporal_intent')
  }

  const dim = goal.temporal?.dateDimension ?? null
  if (dim && dim !== 'wedding.date') {
    pushUnique(codes, 'unsupported_date_dimension')
  }

  if (explicitRange) {
    const dq = query.dateBinding
    if (
      !dq ||
      dq.dimension !== 'wedding.date' ||
      dq.range.from !== explicitRange.from ||
      dq.range.to !== explicitRange.to
    ) {
      pushUnique(codes, 'temporal_range_mismatch')
    }
  }

  // --- Relations ---
  for (const rel of goal.relations) {
    if (
      rel.relation === 'package' ||
      rel.relation === 'extra' ||
      rel.relation === 'payment' ||
      rel.relation === 'contract'
    ) {
      pushUnique(codes, 'unsupported_relation')
    }
    if (
      rel.relation === 'unknown' &&
      rel.field &&
      rel.field !== 'place.name' &&
      rel.field !== 'place.role'
    ) {
      pushUnique(codes, 'unsupported_relation')
    }
  }

  const goalPlace = placeNameFromGoal(goal)
  if (goalPlace) {
    const qPlace = placeNameFromQuery(query)
    if (
      !qPlace ||
      qPlace.toLowerCase() !== goalPlace.toLowerCase()
    ) {
      pushUnique(codes, 'relation_mismatch')
    }
  }

  // --- Aggregation / measure alignment (when GoalSpec is explicit) ---
  if (goal.aggregation === 'count') {
    if (query.aggregate !== 'count' || query.measure != null) {
      pushUnique(codes, 'aggregation_mismatch')
    }
  } else if (goal.aggregation === 'list') {
    if (query.aggregate !== null || query.measure != null) {
      pushUnique(codes, 'aggregation_mismatch')
    }
  } else if (goal.aggregation === 'sum') {
    if (query.aggregate !== 'sum') {
      pushUnique(codes, 'aggregation_mismatch')
    }
  }

  if (goal.measure != null) {
    if (query.measure !== goal.measure) {
      pushUnique(codes, 'measure_mismatch')
    }
    if (!MONEY_MEASURES.has(goal.measure)) {
      pushUnique(codes, 'measure_mismatch')
    }
  }

  // Source: explicit wedding vs DQ
  if (goal.source != null && goal.source !== 'wedding') {
    pushUnique(codes, 'source_mismatch')
  }
  if (query.source !== 'wedding') {
    pushUnique(codes, 'source_mismatch')
  }

  // BoundGoal cross-check when provided (detect silent wipes)
  const bound = input.boundGoal
  if (bound) {
    if (goal.orderBy.length > 0 && bound.orderBy.length === 0) {
      pushUnique(codes, 'orderby_not_preserved')
    }
    if (goal.groupBy.length > 0 && bound.groupBy.length === 0) {
      pushUnique(codes, 'groupby_not_executable')
    }
  }

  if (codes.length > 0) {
    return { status: 'incomplete', reasonCodes: codes }
  }
  return { status: 'complete' }
}

/**
 * IC1 capability matrix helper — typed shapes only (not NL).
 */
export type Ic1CoverageMatrixCase = {
  id: string
  expect: 'complete' | 'incomplete'
  goalSpec: GoalSpec
  domainQuery: DomainQuery
  boundGoal?: BoundGoal | null
}

export function evaluateCoverageMatrixCase(
  c: Ic1CoverageMatrixCase,
): SemanticCoverageResult {
  return assessSemanticCoverage({
    goalSpec: c.goalSpec,
    boundGoal: c.boundGoal,
    domainQuery: c.domainQuery,
  })
}
