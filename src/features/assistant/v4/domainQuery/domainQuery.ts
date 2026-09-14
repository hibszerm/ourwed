/**
 * G0 — DomainQuery V1.
 * Compositional read-query language (not TaskSpec, not SQL).
 * Designed so groupBy / package / extras / payments can extend later
 * without redesigning the root contract.
 */

import type {
  AggregateOperator,
  FilterOperator,
  PlaceRoleValue,
  SemanticFieldId,
} from './fieldRegistry'

export const DOMAIN_QUERY_VERSION = 1 as const
export const DOMAIN_QUERY_LIST_LIMIT = 20
export const DOMAIN_QUERY_MEMBER_ID_CAP = 40

/** G0 sources. Future: session | payment | task | package | extra … */
export type DomainQuerySource = 'wedding'

export type DomainLocalDateRange = {
  from: string
  to: string
}

/**
 * Field filter on a registered semantic field.
 * Values are domain-typed; never SQL fragments.
 */
export type DomainFilter = {
  field: SemanticFieldId
  op: FilterOperator
  /**
   * - text / enum: string
   * - money: number (reserved; unused in G0 composition proofs)
   * - date eq: local date key
   * - in_range: DomainLocalDateRange (prefer dateBinding for wedding.date)
   * - in: string[]
   */
  value: string | number | DomainLocalDateRange | string[] | PlaceRoleValue
}

/**
 * Relation-shaped filter for place (and future package/extras).
 * G0: place.name / place.role only.
 */
export type DomainRelationFilter = {
  relation: 'place'
  field: 'place.name' | 'place.role'
  op: FilterOperator
  value: string | PlaceRoleValue | string[]
}

export type DomainDateBinding = {
  dimension: 'wedding.date'
  range: DomainLocalDateRange
}

export type DomainOrderBy = {
  field: SemanticFieldId
  direction: 'asc' | 'desc'
}

/**
 * Canonical compositional query.
 * Identity of a future activeCollection is this object (normalized).
 */
export type DomainQuery = {
  version: typeof DOMAIN_QUERY_VERSION
  source: DomainQuerySource
  filters: DomainFilter[]
  relations: DomainRelationFilter[]
  measure: SemanticFieldId | null
  aggregate: AggregateOperator | null
  orderBy: DomainOrderBy[]
  limit: number | null
  dateBinding: DomainDateBinding | null
}

/** Future activeCollection contract — not cut over in G0. */
export type DomainActiveCollection = {
  query: DomainQuery
  memberIds?: string[]
  resultCount: number
  label?: string
}

export function emptyDomainQuery(
  partial?: Partial<DomainQuery>,
): DomainQuery {
  return {
    version: DOMAIN_QUERY_VERSION,
    source: 'wedding',
    filters: [],
    relations: [],
    measure: null,
    aggregate: 'count',
    orderBy: [],
    limit: null,
    dateBinding: null,
    ...partial,
  }
}
