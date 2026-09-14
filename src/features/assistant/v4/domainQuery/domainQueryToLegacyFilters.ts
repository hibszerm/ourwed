/**
 * @deprecated G5 transitional — derive legacy filter shape FROM DomainQuery only.
 * Not a semantic Source of Truth. Resolver inheritance must use
 * extractInheritedSemanticsFromDomainQuery(activeCollection.query).
 * Remaining consumers: shadow extras compatibility, adaptV3, CollectionQuery baseline.
 */

import type { DomainQuery } from './domainQuery'
import { extractInheritedSemanticsFromDomainQuery } from './extractInheritedSemantics'

export function domainQueryToLegacyFilters(query: DomainQuery): {
  dateRange: { from: string; to: string } | null
  locationQuery: string | null
  locationRole: 'preparations' | 'ceremony' | 'reception' | 'any' | null
} {
  const slots = extractInheritedSemanticsFromDomainQuery(query)
  return {
    dateRange: slots?.dateRange ?? null,
    locationQuery: slots?.locationQuery ?? null,
    locationRole: slots?.locationRole ?? null,
  }
}
