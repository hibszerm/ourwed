/**
 * G1 — shadow dual-run: CollectionQuery path vs DomainQuery path.
 * Structured agreement only. No prose. No visible state mutation.
 */

import type { CollectionQuery } from '../capabilities/collection/collectionQueryContract'
import {
  executeCollectionQueryOnRows,
  type CollectionMoneyRow,
  type CollectionQueryExecution,
} from '../capabilities/collection/executeCollectionQuery'
import { adaptCollectionQueryToDomainQuery } from './adaptCollectionQuery'
import {
  executeDomainQueryOnRows,
} from './executeDomainQuery'
import type { DomainQuery } from './domainQuery'
import type { DomainQueryObservation } from './observations'

export type DomainQueryAgreement = {
  /** Adapter produced a DomainQuery and filters/op/measure structurally align. */
  queryEquivalent: boolean
  /** Count and/or bounded member ID sets match. */
  membershipEquivalent: boolean
  /** Sum amounts match when both sides are sums; otherwise true if N/A. */
  amountEquivalent: boolean
  /** All three true. */
  agree: boolean
  reasons: string[]
  domainQuery: DomainQuery | null
}

function normalizeLocation(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t ? t.toLowerCase() : null
}

function filtersEquivalent(
  cq: CollectionQuery,
  dq: DomainQuery,
): string[] {
  const reasons: string[] = []

  const cqLoc = normalizeLocation(cq.filters.locationQuery)
  const dqName = dq.relations.find((r) => r.field === 'place.name')
  const dqLoc =
    dqName && typeof dqName.value === 'string'
      ? normalizeLocation(dqName.value)
      : null
  if (cqLoc !== dqLoc) {
    reasons.push(`location:${cqLoc}≠${dqLoc}`)
  }

  const cqRole =
    cq.filters.locationRole && cq.filters.locationRole !== 'any'
      ? cq.filters.locationRole
      : null
  const dqRoleRel = dq.relations.find((r) => r.field === 'place.role')
  const dqRole =
    dqRoleRel && typeof dqRoleRel.value === 'string' ? dqRoleRel.value : null
  if (cqRole !== dqRole) {
    reasons.push(`locationRole:${cqRole}≠${dqRole}`)
  }

  const cqDr = cq.filters.dateRange
  const dqDr = dq.dateBinding?.range ?? null
  const cqKey = cqDr ? `${cqDr.from}..${cqDr.to}` : null
  const dqKey = dqDr ? `${dqDr.from}..${dqDr.to}` : null
  if (cqKey !== dqKey) {
    reasons.push(`dateRange:${cqKey}≠${dqKey}`)
  }

  const cqOp = cq.operation
  const dqOp =
    dq.aggregate === null ? 'list' : dq.aggregate === 'count' ? 'count' : 'sum'
  if (cqOp !== dqOp) {
    reasons.push(`operation:${cqOp}≠${dqOp}`)
  }

  if (cqOp === 'sum') {
    const expectedMeasure =
      cq.metric === 'contract_value'
        ? 'wedding.contract_value'
        : cq.metric === 'paid'
          ? 'wedding.paid_amount'
          : cq.metric === 'remaining'
            ? 'wedding.remaining_amount'
            : null
    if (expectedMeasure !== dq.measure) {
      reasons.push(`measure:${expectedMeasure}≠${dq.measure}`)
    }
  }

  return reasons
}

export function computeDomainQueryAgreement(input: {
  collectionQuery: CollectionQuery
  collectionExec: CollectionQueryExecution
  domainQuery: DomainQuery
  domainObservation: DomainQueryObservation
  domainMemberIds?: string[]
}): DomainQueryAgreement {
  const reasons: string[] = []
  const { collectionQuery: cq, collectionExec, domainQuery: dq, domainObservation: dObs } =
    input

  const filterReasons = filtersEquivalent(cq, dq)
  reasons.push(...filterReasons)
  const queryEquivalent = filterReasons.length === 0

  const cObs = collectionExec.observation
  let membershipEquivalent = true
  if (cObs.totalCount !== dObs.totalCount) {
    membershipEquivalent = false
    reasons.push(`totalCount:${cObs.totalCount}≠${dObs.totalCount}`)
  }
  if (cq.operation === 'list' && dObs.aggregate === 'list') {
    const cIds = (cObs.items ?? []).map((i) => i.resource.id).sort()
    const dIds = (dObs.items ?? []).map((i) => i.resource.id).sort()
    if (cIds.join(',') !== dIds.join(',')) {
      membershipEquivalent = false
      reasons.push('membership_mismatch')
    }
  }
  if (input.domainMemberIds) {
    const cMembers = [...collectionExec.activeCollection.memberIds].sort().join(',')
    const dMembers = [...input.domainMemberIds].sort().join(',')
    if (cMembers !== dMembers) {
      membershipEquivalent = false
      reasons.push('memberIds_mismatch')
    }
  }

  let amountEquivalent = true
  if (cq.operation === 'sum') {
    if ((cObs.amount ?? null) !== (dObs.amount ?? null)) {
      amountEquivalent = false
      reasons.push(`amount:${cObs.amount}≠${dObs.amount}`)
    }
  }

  return {
    queryEquivalent,
    membershipEquivalent,
    amountEquivalent,
    agree: queryEquivalent && membershipEquivalent && amountEquivalent,
    reasons,
    domainQuery: dq,
  }
}

/**
 * Run CollectionQuery executor and DomainQuery executor on the same rows.
 * Shadow/diagnostic only — does not touch WorkingContext.
 */
export function runCollectionDomainQueryDual(input: {
  collectionQuery: CollectionQuery
  rows: CollectionMoneyRow[]
}):
  | {
      ok: true
      agreement: DomainQueryAgreement
      collectionExec: CollectionQueryExecution
      domainObservation: DomainQueryObservation
    }
  | {
      ok: false
      reason: string
      agreement: DomainQueryAgreement
    } {
  const adapted = adaptCollectionQueryToDomainQuery(input.collectionQuery)
  if (!adapted.ok) {
    return {
      ok: false,
      reason: adapted.reason,
      agreement: {
        queryEquivalent: false,
        membershipEquivalent: false,
        amountEquivalent: false,
        agree: false,
        reasons: [adapted.detail ?? adapted.reason],
        domainQuery: null,
      },
    }
  }

  const collectionExec = executeCollectionQueryOnRows(
    input.rows,
    input.collectionQuery,
  )
  const domainResult = executeDomainQueryOnRows(input.rows, adapted.query)
  if (!domainResult.ok) {
    return {
      ok: false,
      reason: domainResult.failure.detail,
      agreement: {
        queryEquivalent: false,
        membershipEquivalent: false,
        amountEquivalent: false,
        agree: false,
        reasons: [domainResult.failure.detail],
        domainQuery: adapted.query,
      },
    }
  }

  const agreement = computeDomainQueryAgreement({
    collectionQuery: input.collectionQuery,
    collectionExec,
    domainQuery: adapted.query,
    domainObservation: domainResult.observation,
    domainMemberIds: domainResult.activeCollection.memberIds,
  })

  return {
    ok: true,
    agreement,
    collectionExec,
    domainObservation: domainResult.observation,
  }
}
