/**
 * IC1 — narrow DomainQuery slice eligible for visible V5 authority.
 * Typed structure only — no utterance / phrase heuristics.
 */

import type { DomainQuery } from '../domainQuery/domainQuery'
import type { SemanticFieldId } from '../domainQuery/fieldRegistry'

const IC1_MONEY_MEASURES = new Set<SemanticFieldId>([
  'wedding.contract_value',
  'wedding.paid_amount',
  'wedding.remaining_amount',
])

/**
 * True when DomainQuery is within the IC1 canary read-query slice:
 * wedding source + count | list | sum(canonical money measures).
 */
export function isIc1CanaryDomainQueryEligible(
  query: DomainQuery | null | undefined,
): boolean {
  if (!query || query.source !== 'wedding') return false

  if (query.aggregate === 'count') {
    return query.measure == null
  }

  // list
  if (query.aggregate === null) {
    return query.measure == null
  }

  if (query.aggregate === 'sum') {
    return (
      query.measure != null && IC1_MONEY_MEASURES.has(query.measure)
    )
  }

  // min/max/avg / unknown
  return false
}
