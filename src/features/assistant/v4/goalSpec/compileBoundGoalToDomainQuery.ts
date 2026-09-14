/**
 * G7 — BoundGoal → DomainQuery.
 * Consumes BoundGoal only — no conversation context, no GoalSpec, no TaskSpec.
 */

import {
  DOMAIN_QUERY_LIST_LIMIT,
  emptyDomainQuery,
  type DomainQuery,
  type DomainRelationFilter,
} from '../domainQuery/domainQuery'
import { validateDomainQuery } from '../domainQuery/validateDomainQuery'
import type { BoundGoal } from './boundGoal'

export type CompileBoundGoalResult =
  | { status: 'success'; query: DomainQuery }
  | { status: 'unsupported'; reason: string }

/**
 * Compile an already-bound goal into DomainQuery for the G7 wedding slice.
 */
export function compileBoundGoalToDomainQuery(
  bound: BoundGoal,
): CompileBoundGoalResult {
  if (bound.requestKind !== 'domain_query') {
    return { status: 'unsupported', reason: 'not_domain_query' }
  }
  if (bound.source !== 'wedding') {
    return { status: 'unsupported', reason: 'source_not_wedding' }
  }
  if (bound.groupBy.length > 0) {
    return { status: 'unsupported', reason: 'groupby_not_in_g7' }
  }

  const relations: DomainRelationFilter[] = bound.relations.map((r) => ({
    relation: 'place' as const,
    field: r.field,
    op: r.op,
    value: r.value,
  }))

  const dateBinding =
    bound.temporal.resolvedRange && bound.temporal.dateDimension === 'wedding.date'
      ? {
          dimension: 'wedding.date' as const,
          range: {
            from: bound.temporal.resolvedRange.from,
            to: bound.temporal.resolvedRange.to,
          },
        }
      : null

  let candidate: DomainQuery
  if (bound.aggregation === 'count') {
    candidate = emptyDomainQuery({
      aggregate: 'count',
      measure: null,
      relations,
      dateBinding,
    })
  } else if (bound.aggregation === 'list') {
    candidate = emptyDomainQuery({
      aggregate: null,
      measure: null,
      relations,
      dateBinding,
      limit: DOMAIN_QUERY_LIST_LIMIT,
    })
  } else {
    if (!bound.measure) {
      return { status: 'unsupported', reason: 'sum_missing_measure' }
    }
    candidate = emptyDomainQuery({
      aggregate: 'sum',
      measure: bound.measure,
      relations,
      dateBinding,
    })
  }

  const validated = validateDomainQuery(candidate)
  if (!validated.ok) {
    return {
      status: 'unsupported',
      reason: `domain_validation_${validated.reason}`,
    }
  }
  return { status: 'success', query: validated.query }
}
