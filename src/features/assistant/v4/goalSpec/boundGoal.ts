/**
 * G7 — BoundGoal: sufficiently resolved meaning for DomainQuery compilation.
 * Differs from GoalSpec: no ambiguities, no unresolved temporal expressions.
 * Not a second GoalSpec — executable semantic slots only.
 */

import type { SemanticFieldId } from '../domainQuery/fieldRegistry'
import type {
  GoalEntityRef,
  GoalOrderBy,
  GoalRequestKind,
  NamedEntityKindHint,
} from './goalSpec'

export type BoundAggregation = 'count' | 'list' | 'sum'

export type BoundPlaceRelation = {
  relation: 'place'
  field: 'place.name' | 'place.role'
  op: 'contains' | 'eq'
  value: string
}

export type BoundTemporal = {
  resolvedRange: { from: string; to: string } | null
  dateDimension: 'wedding.date' | null
}

/**
 * Post-binder meaning for the supported G7 wedding collection slice.
 * Downstream compilers must not need conversation state.
 */
export type BoundGoal = {
  requestKind: Extract<GoalRequestKind, 'domain_query'>
  source: Extract<NamedEntityKindHint, 'wedding'>
  aggregation: BoundAggregation
  measure: SemanticFieldId | null
  temporal: BoundTemporal
  relations: BoundPlaceRelation[]
  orderBy: GoalOrderBy[]
  groupBy: Array<SemanticFieldId | string>
  aspects: string[]
  targets: GoalEntityRef[]
}
