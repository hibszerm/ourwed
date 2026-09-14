/**
 * G1 — structural CollectionQuery → DomainQuery adapter.
 * ONE entrypoint. No utterance parsing. No phrase dictionaries.
 *
 * Canonical input: CollectionQuery (post TaskSpec→resolver→validate).
 * Rank and unsupported ops → null (unsupported by G0 DomainQuery).
 */

import type { CollectionQuery } from '../capabilities/collection/collectionQueryContract'
import {
  emptyDomainQuery,
  type DomainQuery,
  type DomainRelationFilter,
} from './domainQuery'
import { validateDomainQuery } from './validateDomainQuery'

export type AdaptCollectionQueryResult =
  | { ok: true; query: DomainQuery }
  | { ok: false; reason: 'unsupported_operation' | 'invalid_domain_query'; detail?: string }

function relationsFromCollection(
  cq: CollectionQuery,
): DomainRelationFilter[] {
  const relations: DomainRelationFilter[] = []
  const name = cq.filters.locationQuery?.trim()
  if (name) {
    relations.push({
      relation: 'place',
      field: 'place.name',
      op: 'contains',
      value: name,
    })
  }
  const role = cq.filters.locationRole
  if (role && role !== 'any') {
    relations.push({
      relation: 'place',
      field: 'place.role',
      op: 'eq',
      value: role,
    })
  }
  return relations
}

function dateBindingFromCollection(
  cq: CollectionQuery,
): DomainQuery['dateBinding'] {
  const dr = cq.filters.dateRange
  if (dr?.from && dr?.to) {
    return {
      dimension: 'wedding.date',
      range: { from: dr.from, to: dr.to },
    }
  }
  return null
}

/**
 * Translate an already-validated CollectionQuery into DomainQuery.
 * Structural slot mapping only.
 */
export function adaptCollectionQueryToDomainQuery(
  cq: CollectionQuery,
): AdaptCollectionQueryResult {
  const relations = relationsFromCollection(cq)
  const dateBinding = dateBindingFromCollection(cq)

  let candidate: DomainQuery

  if (cq.operation === 'count') {
    candidate = emptyDomainQuery({
      aggregate: 'count',
      measure: null,
      relations,
      dateBinding,
    })
  } else if (cq.operation === 'list') {
    candidate = emptyDomainQuery({
      aggregate: null,
      measure: null,
      relations,
      dateBinding,
      limit: cq.limit ?? 20,
    })
  } else if (cq.operation === 'sum' && cq.metric) {
    const measure =
      cq.metric === 'contract_value'
        ? ('wedding.contract_value' as const)
        : cq.metric === 'paid'
          ? ('wedding.paid_amount' as const)
          : cq.metric === 'remaining'
            ? ('wedding.remaining_amount' as const)
            : null
    if (!measure) {
      return { ok: false, reason: 'unsupported_operation', detail: 'unknown_metric' }
    }
    candidate = emptyDomainQuery({
      aggregate: 'sum',
      measure,
      relations,
      dateBinding,
    })
  } else {
    return {
      ok: false,
      reason: 'unsupported_operation',
      detail: cq.operation,
    }
  }

  const validated = validateDomainQuery(candidate)
  if (!validated.ok) {
    return {
      ok: false,
      reason: 'invalid_domain_query',
      detail: validated.reason,
    }
  }
  return { ok: true, query: validated.query }
}

/**
 * Build a CollectionQuery from an existing filters bag + new operation
 * (structural follow-up). Does not inspect natural language.
 */
export function collectionFiltersWithOperation(input: {
  filters: CollectionQuery['filters']
  operation: 'count' | 'list' | 'sum'
  metric?: CollectionQuery['metric']
  limit?: number | null
}): CollectionQuery {
  return {
    resource: 'wedding',
    operation: input.operation,
    filters: {
      dateRange: input.filters.dateRange ?? null,
      locationQuery: input.filters.locationQuery ?? null,
      locationRole: input.filters.locationRole ?? null,
    },
    metric: input.operation === 'sum' ? (input.metric ?? null) : null,
    rank: null,
    limit: input.operation === 'list' ? (input.limit ?? 20) : null,
    usedActiveCollection: true,
  }
}
