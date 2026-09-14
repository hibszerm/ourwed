/**
 * G3 — Direct compiler: ResolvedTask → DomainQuery.
 *
 * SELECTED INPUT: ResolvedTask (post Context Resolver) only.
 * Does NOT read V4ShadowContext / activeCollection.
 *
 * Resolver owns inheritance (G5: from DomainQuery).
 * Compiler translates already-resolved slots:
 * - op → aggregate (count|list|sum)
 * - subject → measure (contract_value|paid|remaining)
 * - temporal.from/to OR collection.filters.dateRange → dateBinding
 *   (filters here are resolver OUTPUT slots, not live activeCollection.filters)
 * - collection.filters.locationQuery → place.name
 * - collection.filters.locationRole → place.role
 *
 * Missing / unsupported without heuristics:
 * - rank / avg / groupBy
 * - session|assignment collections
 * - package / extras / payment entities
 */

import type { ResolvedTask } from '../resolver/types'
import {
  emptyDomainQuery,
  type DomainQuery,
  type DomainRelationFilter,
} from './domainQuery'
import { validateDomainQuery } from './validateDomainQuery'
import type { SemanticFieldId } from './fieldRegistry'

export type CompileDomainQueryResult =
  | { status: 'success'; query: DomainQuery }
  | { status: 'unsupported'; reason: string }
  | {
      status: 'needs_semantic_slot'
      slot:
        | 'measure'
        | 'operation'
        | 'source'
        | 'date_binding'
        | 'place'
      reason: string
    }

function mapMeasure(
  subject: ResolvedTask['subject'],
): SemanticFieldId | null {
  if (subject === 'contract_value') return 'wedding.contract_value'
  if (subject === 'paid') return 'wedding.paid_amount'
  if (subject === 'remaining') return 'wedding.remaining_amount'
  return null
}

function isWeddingCollection(resolved: ResolvedTask): boolean {
  const res = resolved.collection?.resource
  if (res === 'sessions' || res === 'assignments') return false
  if (resolved.subject === 'session') return false
  return true
}

/**
 * Compile POST-RESOLUTION V4 semantics into DomainQuery.
 * Does not accept CollectionQuery. Does not inspect utterances.
 */
export function compileResolvedSemanticsToDomainQuery(
  resolved: ResolvedTask,
): CompileDomainQueryResult {
  if (!isWeddingCollection(resolved)) {
    return {
      status: 'unsupported',
      reason: 'source_not_wedding_collection',
    }
  }

  const op = resolved.op
  if (op === 'rank') {
    return { status: 'unsupported', reason: 'rank_not_in_g0' }
  }
  if (op !== 'count' && op !== 'list' && op !== 'sum') {
    // Finance follow-ups already remapped to sum by resolver when collection-scoped.
    if (
      op === 'get_amount' ||
      op === 'get' ||
      op === 'inherit'
    ) {
      return {
        status: 'needs_semantic_slot',
        slot: 'operation',
        reason:
          'collection_op_not_normalized_to_count_list_sum',
      }
    }
    return { status: 'unsupported', reason: `op_${op}` }
  }

  const filters = resolved.collection?.filters
  const relations: DomainRelationFilter[] = []

  const locationQuery = filters?.locationQuery?.trim() || null
  if (locationQuery && locationQuery.length >= 2) {
    relations.push({
      relation: 'place',
      field: 'place.name',
      op: 'contains',
      value: locationQuery,
    })
  }

  const locationRole = filters?.locationRole
  if (locationRole && locationRole !== 'any') {
    relations.push({
      relation: 'place',
      field: 'place.role',
      op: 'eq',
      value: locationRole,
    })
  }

  // Prefer already-resolved ISO on temporal; else collection filter dateRange.
  const from =
    resolved.temporal?.from ?? filters?.dateRange?.from ?? null
  const to = resolved.temporal?.to ?? filters?.dateRange?.to ?? null
  const dateBinding =
    from && to
      ? {
          dimension: 'wedding.date' as const,
          range: { from, to },
        }
      : null

  let candidate: DomainQuery

  if (op === 'count') {
    candidate = emptyDomainQuery({
      aggregate: 'count',
      measure: null,
      relations,
      dateBinding,
    })
  } else if (op === 'list') {
    candidate = emptyDomainQuery({
      aggregate: null,
      measure: null,
      relations,
      dateBinding,
      limit: 20,
    })
  } else {
    // sum
    const measure = mapMeasure(resolved.subject)
    if (!measure) {
      return {
        status: 'needs_semantic_slot',
        slot: 'measure',
        reason: 'sum_requires_contract_value_paid_or_remaining_subject',
      }
    }
    candidate = emptyDomainQuery({
      aggregate: 'sum',
      measure,
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
