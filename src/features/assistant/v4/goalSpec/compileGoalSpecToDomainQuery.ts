/**
 * G6 — GoalSpec → DomainQuery for the supported wedding collection slice.
 * Shadow proof path only. Does not replace G3/G4 primary compiler yet.
 *
 * Consumes GoalSpec only — no TaskSpec, no utterances, no context store.
 */

import {
  emptyDomainQuery,
  type DomainQuery,
  type DomainRelationFilter,
} from '../domainQuery/domainQuery'
import { validateDomainQuery } from '../domainQuery/validateDomainQuery'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import type { GoalSpec, NamedEntityRef } from './goalSpec'
import { DOMAIN_QUERY_LIST_LIMIT } from '../domainQuery/domainQuery'

export type CompileGoalSpecDomainQueryResult =
  | { status: 'success'; query: DomainQuery }
  | { status: 'unsupported'; reason: string }
  | {
      status: 'needs_clarification'
      slot: string
      reason: string
    }

function isSemanticFieldId(v: string): v is SemanticFieldId {
  return (
    v === 'wedding.date' ||
    v === 'wedding.contract_value' ||
    v === 'wedding.paid_amount' ||
    v === 'wedding.remaining_amount' ||
    v === 'place.name' ||
    v === 'place.role'
  )
}

function placeNameFromValue(
  value: GoalSpec['relations'][number]['value'],
): string | null {
  if (typeof value === 'string' && value.trim().length >= 2) return value.trim()
  if (value && typeof value === 'object' && 'text' in value) {
    const ref = value as NamedEntityRef
    return ref.text.trim().length >= 2 ? ref.text.trim() : null
  }
  return null
}

/**
 * Compile a query-shaped GoalSpec into DomainQuery for the G0/G5 wedding slice.
 * Ambiguities → needs_clarification (no guessing).
 */
export function compileGoalSpecToDomainQuery(
  goal: GoalSpec,
): CompileGoalSpecDomainQueryResult {
  if (goal.requestKind !== 'domain_query') {
    return {
      status: 'unsupported',
      reason: `request_kind_${goal.requestKind}`,
    }
  }

  if (goal.ambiguities.length > 0) {
    const a = goal.ambiguities[0]!
    return {
      status: 'needs_clarification',
      slot: a.slot,
      reason: a.reason,
    }
  }

  if (goal.source && goal.source !== 'wedding') {
    return {
      status: 'unsupported',
      reason: `source_${goal.source}_not_in_g0_slice`,
    }
  }

  const agg = goal.aggregation
  if (agg === 'rank' || agg === 'avg' || agg === 'group' || agg === 'min' || agg === 'max') {
    return { status: 'unsupported', reason: `aggregate_${agg}_not_in_g0_slice` }
  }
  if (agg !== 'count' && agg !== 'sum' && agg !== 'list' && agg !== null) {
    return { status: 'unsupported', reason: `aggregate_${String(agg)}` }
  }
  // null aggregation with list-like aspects is treated as unsupported here
  if (agg === null) {
    return {
      status: 'needs_clarification',
      slot: 'aggregation',
      reason: 'aggregation_required',
    }
  }

  if (goal.groupBy.length > 0) {
    return { status: 'unsupported', reason: 'groupby_not_in_g0_slice' }
  }

  const relations: DomainRelationFilter[] = []
  for (const rel of goal.relations) {
    if (rel.relation !== 'place') {
      return {
        status: 'unsupported',
        reason: `relation_${rel.relation}_not_in_g0_slice`,
      }
    }
    if (rel.field === 'place.name' || rel.field === null) {
      const name = placeNameFromValue(rel.value)
      if (name) {
        relations.push({
          relation: 'place',
          field: 'place.name',
          op: 'contains',
          value: name,
        })
      }
    }
    if (rel.field === 'place.role') {
      const role =
        typeof rel.value === 'string'
          ? rel.value
          : rel.value &&
              typeof rel.value === 'object' &&
              'roleHint' in rel.value
            ? (rel.value as NamedEntityRef).roleHint
            : null
      if (
        role === 'preparations' ||
        role === 'ceremony' ||
        role === 'reception'
      ) {
        relations.push({
          relation: 'place',
          field: 'place.role',
          op: 'eq',
          value: role,
        })
      }
    }
  }

  // Also lift roleHint from place.name NamedEntityRef when role relation absent
  for (const rel of goal.relations) {
    if (rel.field === 'place.name' && rel.value && typeof rel.value === 'object') {
      const ref = rel.value as NamedEntityRef
      if (
        ref.roleHint &&
        !relations.some((r) => r.field === 'place.role')
      ) {
        // roleHint 'any' is not a PlaceRoleHint — only concrete roles
        if (
          ref.roleHint === 'preparations' ||
          ref.roleHint === 'ceremony' ||
          ref.roleHint === 'reception'
        ) {
          relations.push({
            relation: 'place',
            field: 'place.role',
            op: 'eq',
            value: ref.roleHint,
          })
        }
      }
    }
  }

  let dateBinding: DomainQuery['dateBinding'] = null
  if (goal.temporal?.dateDimensionAmbiguous) {
    return {
      status: 'needs_clarification',
      slot: 'date_dimension',
      reason: 'date_dimension_ambiguous',
    }
  }
  if (goal.temporal?.resolvedRange) {
    const dim = goal.temporal.dateDimension
    if (dim && dim !== 'wedding.date') {
      return {
        status: 'unsupported',
        reason: `date_dimension_${dim}_not_in_g0_slice`,
      }
    }
    // Supported slice: resolved range binds wedding.date when not ambiguous
    dateBinding = {
      dimension: 'wedding.date',
      range: {
        from: goal.temporal.resolvedRange.from,
        to: goal.temporal.resolvedRange.to,
      },
    }
  }

  const measure: SemanticFieldId | null = goal.measure
  if (measure && !isSemanticFieldId(measure)) {
    return { status: 'unsupported', reason: `measure_${measure}` }
  }

  let candidate: DomainQuery
  if (agg === 'count') {
    candidate = emptyDomainQuery({
      aggregate: 'count',
      measure: null,
      relations,
      dateBinding,
    })
  } else if (agg === 'list') {
    candidate = emptyDomainQuery({
      aggregate: null,
      measure: null,
      relations,
      dateBinding,
      limit: DOMAIN_QUERY_LIST_LIMIT,
    })
  } else {
    // sum
    if (!measure) {
      return {
        status: 'needs_clarification',
        slot: 'measure',
        reason: 'sum_requires_measure',
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
