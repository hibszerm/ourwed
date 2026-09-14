/**
 * G3 — three-way shadow comparison:
 * current CollectionQuery execution
 * vs G1 adapter DomainQuery
 * vs G3 direct DomainQuery
 *
 * CollectionQuery is baseline only — never fed into the G3 compiler.
 */

import type { CollectionQuery } from '../capabilities/collection/collectionQueryContract'
import {
  executeCollectionQueryOnRows,
  type CollectionMoneyRow,
} from '../capabilities/collection/executeCollectionQuery'
import type { ResolvedTask } from '../resolver/types'
import { adaptCollectionQueryToDomainQuery } from './adaptCollectionQuery'
import { compileResolvedSemanticsToDomainQuery } from './compileResolvedSemantics'
import { executeDomainQueryOnRows } from './executeDomainQuery'
import type { DomainQuery } from './domainQuery'
import { computeDomainQueryAgreement } from './runCollectionDomainQueryDual'

export type ThreeWayDomainQueryComparison = {
  directStatus: 'success' | 'unsupported' | 'needs_semantic_slot'
  directReason?: string
  /** G3 direct vs G1 adapter DomainQuery structure. */
  direct_vs_adapter_query: boolean | null
  /** G3 direct vs current CollectionQuery membership. */
  direct_vs_current_membership: boolean | null
  /** G3 direct vs current CollectionQuery amount (sum only). */
  direct_vs_current_amount: boolean | null
  agreeAll: boolean
  reasons: string[]
  directQuery: DomainQuery | null
  adapterQuery: DomainQuery | null
}

function domainQueriesStructurallyEqual(
  a: DomainQuery,
  b: DomainQuery,
): string[] {
  const reasons: string[] = []
  if (a.aggregate !== b.aggregate) {
    reasons.push(`aggregate:${a.aggregate}≠${b.aggregate}`)
  }
  if (a.measure !== b.measure) {
    reasons.push(`measure:${a.measure}≠${b.measure}`)
  }
  const aDr = a.dateBinding?.range
  const bDr = b.dateBinding?.range
  const aKey = aDr ? `${aDr.from}..${aDr.to}` : null
  const bKey = bDr ? `${bDr.from}..${bDr.to}` : null
  if (aKey !== bKey) reasons.push(`date:${aKey}≠${bKey}`)

  const aPlace = a.relations.find((r) => r.field === 'place.name')
  const bPlace = b.relations.find((r) => r.field === 'place.name')
  const aName =
    aPlace && typeof aPlace.value === 'string'
      ? aPlace.value.trim().toLowerCase()
      : null
  const bName =
    bPlace && typeof bPlace.value === 'string'
      ? bPlace.value.trim().toLowerCase()
      : null
  if (aName !== bName) reasons.push(`place:${aName}≠${bName}`)

  const aRole = a.relations.find((r) => r.field === 'place.role')
  const bRole = b.relations.find((r) => r.field === 'place.role')
  const aRv =
    aRole && typeof aRole.value === 'string' ? aRole.value : null
  const bRv =
    bRole && typeof bRole.value === 'string' ? bRole.value : null
  if (aRv !== bRv) reasons.push(`role:${aRv}≠${bRv}`)

  return reasons
}

/**
 * Compare current CQ path, G1 adapter DQ, and G3 direct DQ on the same rows.
 * `collectionQuery` must be built independently (baseline) — not used by G3 compiler.
 */
export function compareThreeWayDomainQuery(input: {
  resolved: ResolvedTask
  /** Migration baseline — independent of G3 compiler. */
  collectionQuery: CollectionQuery
  rows: CollectionMoneyRow[]
}): ThreeWayDomainQueryComparison {
  const reasons: string[] = []
  const direct = compileResolvedSemanticsToDomainQuery(input.resolved)
  if (direct.status !== 'success') {
    return {
      directStatus: direct.status,
      directReason:
        direct.status === 'unsupported'
          ? direct.reason
          : direct.reason,
      direct_vs_adapter_query: null,
      direct_vs_current_membership: null,
      direct_vs_current_amount: null,
      agreeAll: false,
      reasons: [direct.status === 'unsupported' ? direct.reason : direct.reason],
      directQuery: null,
      adapterQuery: null,
    }
  }

  const adapted = adaptCollectionQueryToDomainQuery(input.collectionQuery)
  const adapterQuery = adapted.ok ? adapted.query : null
  let direct_vs_adapter_query: boolean
  if (adapterQuery) {
    const structReasons = domainQueriesStructurallyEqual(
      direct.query,
      adapterQuery,
    )
    direct_vs_adapter_query = structReasons.length === 0
    if (!direct_vs_adapter_query) {
      reasons.push(...structReasons.map((r) => `adapter:${r}`))
    }
  } else {
    direct_vs_adapter_query = false
    reasons.push(`adapter_failed:${adapted.ok === false ? adapted.reason : ''}`)
  }

  const cqExec = executeCollectionQueryOnRows(
    input.rows,
    input.collectionQuery,
  )
  const dqExec = executeDomainQueryOnRows(input.rows, direct.query)
  if (!dqExec.ok) {
    return {
      directStatus: 'success',
      direct_vs_adapter_query,
      direct_vs_current_membership: false,
      direct_vs_current_amount: false,
      agreeAll: false,
      reasons: [...reasons, dqExec.failure.detail],
      directQuery: direct.query,
      adapterQuery,
    }
  }

  const agreement = computeDomainQueryAgreement({
    collectionQuery: input.collectionQuery,
    collectionExec: cqExec,
    domainQuery: direct.query,
    domainObservation: dqExec.observation,
    domainMemberIds: dqExec.activeCollection.memberIds,
  })

  const direct_vs_current_membership = agreement.membershipEquivalent
  const direct_vs_current_amount =
    input.collectionQuery.operation === 'sum'
      ? agreement.amountEquivalent
      : true

  if (!direct_vs_current_membership) {
    reasons.push(...agreement.reasons.filter((r) => r.startsWith('totalCount') || r.includes('member')))
  }
  if (!direct_vs_current_amount) {
    reasons.push(...agreement.reasons.filter((r) => r.startsWith('amount')))
  }

  const agreeAll =
    direct_vs_adapter_query === true &&
    direct_vs_current_membership &&
    direct_vs_current_amount

  return {
    directStatus: 'success',
    direct_vs_adapter_query,
    direct_vs_current_membership,
    direct_vs_current_amount,
    agreeAll,
    reasons,
    directQuery: direct.query,
    adapterQuery,
  }
}
