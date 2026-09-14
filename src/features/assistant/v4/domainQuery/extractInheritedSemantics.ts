/**
 * G5 — Read-only semantic view over DomainQuery for Context Resolver inheritance.
 * Not a second query representation. Not persisted as Source of Truth.
 * Authority remains: activeCollection.query = DomainQuery.
 */

import type { DomainQuery } from './domainQuery'
import type { SemanticFieldId } from './fieldRegistry'

export type InheritedCollectionSemantics = {
  /** wedding.date binding */
  dateRange: { from: string; to: string } | null
  /** place.name contains */
  locationQuery: string | null
  /** place.role (or 'any' when name present without role) */
  locationRole: 'preparations' | 'ceremony' | 'reception' | 'any' | null
  /**
   * Financial measure as TaskSpec subject, when DomainQuery.measure is set.
   * Operation/aggregate is NOT collection identity — not exposed here.
   */
  measureSubject: 'contract_value' | 'paid' | 'remaining' | null
  source: 'wedding' | null
}

function measureToSubject(
  measure: SemanticFieldId | null,
): InheritedCollectionSemantics['measureSubject'] {
  if (measure === 'wedding.contract_value') return 'contract_value'
  if (measure === 'wedding.paid_amount') return 'paid'
  if (measure === 'wedding.remaining_amount') return 'remaining'
  return null
}

/**
 * Extract inheritable slots from a DomainQuery.
 * Returns null when query is absent or not a wedding collection source.
 */
export function extractInheritedSemanticsFromDomainQuery(
  query: DomainQuery | null | undefined,
): InheritedCollectionSemantics | null {
  if (!query || query.source !== 'wedding') return null

  const place = query.relations.find((r) => r.field === 'place.name')
  const role = query.relations.find((r) => r.field === 'place.role')
  const locationQuery =
    place && typeof place.value === 'string' ? place.value : null
  const locationRole =
    role && typeof role.value === 'string'
      ? (role.value as InheritedCollectionSemantics['locationRole'])
      : locationQuery
        ? ('any' as const)
        : null

  return {
    dateRange: query.dateBinding?.range
      ? { from: query.dateBinding.range.from, to: query.dateBinding.range.to }
      : null,
    locationQuery,
    locationRole,
    measureSubject: measureToSubject(query.measure),
    source: 'wedding',
  }
}
