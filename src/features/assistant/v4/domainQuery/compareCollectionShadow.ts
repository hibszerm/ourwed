/**
 * G0/G1 — CollectionQuery ↔ DomainQuery compare helpers.
 * Canonical adapter lives in adaptCollectionQuery.ts.
 */

import type { CollectionQuery } from '../capabilities/collection/collectionQueryContract'
import type { CollectionObservation } from '../observations/types'
import type { DomainQuery } from './domainQuery'
import type { DomainQueryObservation } from './observations'
import { adaptCollectionQueryToDomainQuery } from './adaptCollectionQuery'

export type DomainQueryShadowComparison = {
  comparable: boolean
  agree: boolean
  reasons: string[]
}

/** @deprecated Prefer adaptCollectionQueryToDomainQuery — kept for G0 dual-run tests. */
export function collectionQueryToDomainQuery(
  cq: CollectionQuery,
): DomainQuery | null {
  const r = adaptCollectionQueryToDomainQuery(cq)
  return r.ok ? r.query : null
}

export function compareCollectionVsDomainObservation(input: {
  collection: CollectionObservation
  domain: DomainQueryObservation
}): DomainQueryShadowComparison {
  const reasons: string[] = []
  const { collection: c, domain: d } = input

  const cAgg = c.operation === 'list' ? 'list' : c.operation
  const dAgg = d.aggregate
  if (cAgg !== dAgg) reasons.push(`aggregate:${cAgg}≠${dAgg}`)

  if (c.totalCount !== d.totalCount) {
    reasons.push(`totalCount:${c.totalCount}≠${d.totalCount}`)
  }

  if (c.operation === 'sum' || d.aggregate === 'sum') {
    if ((c.amount ?? null) !== (d.amount ?? null)) {
      reasons.push(`amount:${c.amount}≠${d.amount}`)
    }
  }

  if (c.operation === 'list' && d.aggregate === 'list') {
    const cIds = (c.items ?? []).map((i) => i.resource.id).sort()
    const dIds = (d.items ?? []).map((i) => i.resource.id).sort()
    if (cIds.join(',') !== dIds.join(',')) {
      reasons.push('membership_mismatch')
    }
  }

  return {
    comparable: true,
    agree: reasons.length === 0,
    reasons,
  }
}
