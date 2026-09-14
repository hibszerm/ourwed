/**
 * G2 — DEV shadow DomainQuery agreement diagnostics.
 * Migration bridge: observes CollectionQuery vs DomainQuery without changing product authority.
 * Fire-and-forget. No conversation state. No NL reinterpretation.
 */

import type { CollectionQuery } from '../capabilities/collection/collectionQueryContract'
import type { CollectionObservation } from '../observations/types'
import type { CollectionMoneyRow } from '../capabilities/collection/executeCollectionQuery'
import {
  executeCollectionQueryOnRows,
  weddingToCollectionRow,
} from '../capabilities/collection/executeCollectionQuery'
import { weddingListLightService } from '@/lib/api/weddingListLightService'
import { FINANCE_INCLUDED_STATUSES } from '@/lib/finance/financeSeasonAggregate'
import type { Wedding } from '@/types/wedding'
import { adaptCollectionQueryToDomainQuery } from './adaptCollectionQuery'
import {
  computeDomainQueryAgreement,
  type DomainQueryAgreement,
} from './runCollectionDomainQueryDual'
import { executeDomainQueryOnRows } from './executeDomainQuery'
import type { DomainQuery } from './domainQuery'
import {
  isAnyV4CapabilityExecutionEnabled,
  isAssistantV4ShadowEnabled,
} from '../flag'

export type DomainQueryAgreementClassification =
  | 'agree'
  | 'mismatch'
  | 'unsupported'
  | 'shadow_error'

/** Safe diagnostic — query structure + counts/amounts only. */
export type DomainQueryAgreementTrace = {
  turnId: string
  capabilityId: 'collection.query'
  classification: DomainQueryAgreementClassification
  collectionQuery: {
    operation: CollectionQuery['operation']
    metric: CollectionQuery['metric']
    dateRange: { from: string; to: string } | null
    locationQuery: string | null
    locationRole: string | null
  }
  domainQuery: {
    aggregate: DomainQuery['aggregate']
    measure: DomainQuery['measure']
    dateFrom: string | null
    dateTo: string | null
    placeName: string | null
    placeRole: string | null
  } | null
  queryEquivalent: boolean | null
  membershipEquivalent: boolean | null
  amountEquivalent: boolean | null
  unsupportedReason?: string
  shadowError?: string
}

type AgreementListener = (trace: DomainQueryAgreementTrace) => void

const listeners = new Set<AgreementListener>()

/** Test/DEV subscribe — not conversation state. */
export function subscribeDomainQueryAgreement(
  listener: AgreementListener,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emitAgreement(trace: DomainQueryAgreementTrace): void {
  for (const l of listeners) {
    try {
      l(trace)
    } catch {
      /* ignore */
    }
  }
  if (import.meta.env?.DEV) {
    console.debug('[assistant-domain-query-agreement]', {
      turnId: trace.turnId,
      classification: trace.classification,
      operation: trace.collectionQuery.operation,
      queryEquivalent: trace.queryEquivalent,
      membershipEquivalent: trace.membershipEquivalent,
      amountEquivalent: trace.amountEquivalent,
      unsupportedReason: trace.unsupportedReason ?? null,
      shadowError: trace.shadowError ?? null,
    })
  }
}

function isIncludedWedding(w: Wedding): boolean {
  return (FINANCE_INCLUDED_STATUSES as readonly string[]).includes(w.status)
}

function summarizeCollectionQuery(cq: CollectionQuery) {
  return {
    operation: cq.operation,
    metric: cq.metric ?? null,
    dateRange: cq.filters.dateRange ?? null,
    locationQuery: cq.filters.locationQuery ?? null,
    locationRole: cq.filters.locationRole ?? null,
  }
}

function summarizeDomainQuery(dq: DomainQuery) {
  const place = dq.relations.find((r) => r.field === 'place.name')
  const role = dq.relations.find((r) => r.field === 'place.role')
  return {
    aggregate: dq.aggregate,
    measure: dq.measure,
    dateFrom: dq.dateBinding?.range.from ?? null,
    dateTo: dq.dateBinding?.range.to ?? null,
    placeName:
      place && typeof place.value === 'string' ? place.value : null,
    placeRole: role && typeof role.value === 'string' ? role.value : null,
  }
}

function agreementToClassification(
  a: DomainQueryAgreement,
): DomainQueryAgreementClassification {
  return a.agree ? 'agree' : 'mismatch'
}

/**
 * G2 gate: DEV/shadow capability execution only.
 * Reuses existing V4 shadow/execution flags — no new permanent flag system.
 * Production builds stay OFF.
 */
export function isDomainQueryAgreementShadowEnabled(): boolean {
  if (import.meta.env?.PROD) return false
  return (
    isAssistantV4ShadowEnabled() || isAnyV4CapabilityExecutionEnabled()
  )
}

export type RunDomainQueryAgreementInput = {
  turnId: string
  collectionQuery: CollectionQuery
  observation: CollectionObservation
  memberIds?: string[]
  /** Inject rows for tests; live path loads list-light. */
  rows?: CollectionMoneyRow[]
  loadRows?: () => Promise<CollectionMoneyRow[]>
}

/**
 * Synchronous/async diagnostic runner (testable).
 * Does not mutate WorkingContext / shadow conversation overlay.
 */
export async function runDomainQueryAgreementDiagnostic(
  input: RunDomainQueryAgreementInput,
): Promise<DomainQueryAgreementTrace> {
  const base = {
    turnId: input.turnId,
    capabilityId: 'collection.query' as const,
    collectionQuery: summarizeCollectionQuery(input.collectionQuery),
  }

  try {
    const adapted = adaptCollectionQueryToDomainQuery(input.collectionQuery)
    if (!adapted.ok) {
      const trace: DomainQueryAgreementTrace = {
        ...base,
        classification: 'unsupported',
        domainQuery: null,
        queryEquivalent: null,
        membershipEquivalent: null,
        amountEquivalent: null,
        unsupportedReason: adapted.detail ?? adapted.reason,
      }
      emitAgreement(trace)
      return trace
    }

    const rows =
      input.rows ??
      (input.loadRows
        ? await input.loadRows()
        : (await weddingListLightService.listWeddingsForList())
            .filter(isIncludedWedding)
            .map(weddingToCollectionRow))

    // Re-run collection on same rows only for agreement membership IDs;
    // product observation already succeeded — this is shadow-only.
    const collectionExec = executeCollectionQueryOnRows(
      rows,
      input.collectionQuery,
    )
    const domainResult = executeDomainQueryOnRows(rows, adapted.query)
    if (!domainResult.ok) {
      const trace: DomainQueryAgreementTrace = {
        ...base,
        classification: 'shadow_error',
        domainQuery: summarizeDomainQuery(adapted.query),
        queryEquivalent: null,
        membershipEquivalent: null,
        amountEquivalent: null,
        shadowError: domainResult.failure.detail,
      }
      emitAgreement(trace)
      return trace
    }

    const agreement = computeDomainQueryAgreement({
      collectionQuery: input.collectionQuery,
      collectionExec,
      domainQuery: adapted.query,
      domainObservation: domainResult.observation,
      domainMemberIds: domainResult.activeCollection.memberIds,
    })

    const trace: DomainQueryAgreementTrace = {
      ...base,
      classification: agreementToClassification(agreement),
      domainQuery: summarizeDomainQuery(adapted.query),
      queryEquivalent: agreement.queryEquivalent,
      membershipEquivalent: agreement.membershipEquivalent,
      amountEquivalent: agreement.amountEquivalent,
    }
    emitAgreement(trace)
    return trace
  } catch (e) {
    const trace: DomainQueryAgreementTrace = {
      ...base,
      classification: 'shadow_error',
      domainQuery: null,
      queryEquivalent: null,
      membershipEquivalent: null,
      amountEquivalent: null,
      shadowError: e instanceof Error ? e.message : 'unknown',
    }
    emitAgreement(trace)
    return trace
  }
}

/**
 * Fire-and-forget schedule. Never throws to caller.
 * Returns false when gated OFF (no dual-run).
 * `enabled: false` forces skip (tests). `force: true` runs even if env gate off.
 */
export function scheduleDomainQueryAgreementShadow(
  input: RunDomainQueryAgreementInput & {
    force?: boolean
    /** Explicit OFF for tests — not a product feature flag. */
    enabled?: boolean
  },
): boolean {
  if (input.enabled === false) return false
  if (!input.force && !isDomainQueryAgreementShadowEnabled()) {
    return false
  }
  void runDomainQueryAgreementDiagnostic(input).catch(() => {
    /* never block product */
  })
  return true
}
