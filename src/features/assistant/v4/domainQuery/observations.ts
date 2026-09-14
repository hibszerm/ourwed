/**
 * G0 — DomainQuery observations (facts only, no LLM prose).
 */

import type { DomainQuery } from './domainQuery'
import type { AggregateOperator, SemanticFieldId } from './fieldRegistry'

export type DomainQueryObservation = {
  kind: 'domain_query'
  /** Normalized executed query — semantic identity of the result set. */
  query: DomainQuery
  aggregate: AggregateOperator | 'list' | null
  measure: SemanticFieldId | null
  totalCount: number
  returnedCount: number
  truncated: boolean
  amount?: number
  currency: string
  items?: Array<{
    resource: { kind: 'wedding'; id: string }
    displayName: string
    date: string | null
    metricValue?: number
  }>
}

export type DomainQueryFailure = {
  kind: 'domain_query_failure'
  reason:
    | 'validation_failed'
    | 'unsupported'
    | 'execution_error'
  detail: string
}

export type DomainQueryResult =
  | {
      ok: true
      observation: DomainQueryObservation
      /** Future activeCollection shape — diagnostic only in G0. */
      activeCollection: {
        query: DomainQuery
        memberIds: string[]
        resultCount: number
      }
    }
  | { ok: false; failure: DomainQueryFailure }
