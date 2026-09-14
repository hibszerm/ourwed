/**
 * G4 — DomainQuery as primary V4 shadow collection executor.
 * CollectionQuery runs in parallel for migration diagnostics only.
 * Never: CollectionQuery → DomainQuery for the primary path.
 */

import type { CollectionObservation } from '../observations/types'
import type { ResolvedTask } from '../resolver/types'
import type { DomainQuery } from './domainQuery'
import type { DomainQueryObservation } from './observations'
import { compileResolvedSemanticsToDomainQuery } from './compileResolvedSemantics'
import { executeDomainQueryShadow } from './executeDomainQuery'
import { domainQueryToLegacyFilters } from './domainQueryToLegacyFilters'
import type { CollectionQuery } from '../capabilities/collection/collectionQueryContract'
import {
  executeCollectionQueryOnRows,
  weddingToCollectionRow,
  type CollectionMoneyRow,
} from '../capabilities/collection/executeCollectionQuery'
import { computeDomainQueryAgreement } from './runCollectionDomainQueryDual'
import { weddingListLightService } from '@/lib/api/weddingListLightService'
import { FINANCE_INCLUDED_STATUSES } from '@/lib/finance/financeSeasonAggregate'
import type { Wedding } from '@/types/wedding'

export type G4BaselineClassification =
  | 'agree'
  | 'mismatch'
  | 'unsupported_direct'
  | 'legacy_only'
  | 'shadow_error'
  | 'baseline_skipped'
  | 'baseline_error'

export type G4CollectionPrimaryResult = {
  observation: DomainQueryObservation
  domainQuery: DomainQuery
  activeCollection: {
    resource: 'weddings'
    /** G4 semantic identity. */
    query: DomainQuery
    /** Derived for Context Resolver inheritance — not independent SoT. */
    filters: ReturnType<typeof domainQueryToLegacyFilters>
    memberIds: string[]
    resultCount: number
    label?: string
  }
  activeResource: {
    kind: 'wedding'
    id: string
    label: string
  } | null
  baseline: {
    classification: G4BaselineClassification
    collectionQuery: CollectionQuery | null
    reasons: string[]
  }
}

function isIncludedWedding(w: Wedding): boolean {
  return (FINANCE_INCLUDED_STATUSES as readonly string[]).includes(w.status)
}

/**
 * Primary G4 execution from ResolvedTask.
 * `baselineCollectionQuery` is optional comparison-only; never used to build DomainQuery.
 * `disableBaseline` proves primary independence (authority proof).
 */
export async function executeCollectionDomainQueryPrimary(input: {
  resolved: ResolvedTask
  baselineCollectionQuery?: CollectionQuery | null
  /** Authority proof: skip CollectionQuery baseline entirely. */
  disableBaseline?: boolean
  /**
   * Test injection: custom DomainQuery executor.
   * Default: executeDomainQueryShadow (list-light).
   */
  executeDomain?: (
    query: DomainQuery,
  ) => Promise<import('./observations').DomainQueryResult>
  /**
   * Baseline comparison rows only — never feeds DomainQuery compile.
   * Default: list-light → money rows.
   */
  loadBaselineRows?: () => Promise<CollectionMoneyRow[]>
}): Promise<
  | { ok: true; result: G4CollectionPrimaryResult }
  | {
      ok: false
      classification: 'unsupported_direct' | 'shadow_error'
      reason: string
    }
> {
  const compiled = compileResolvedSemanticsToDomainQuery(input.resolved)
  if (compiled.status !== 'success') {
    return {
      ok: false,
      classification: 'unsupported_direct',
      reason:
        compiled.status === 'unsupported'
          ? compiled.reason
          : `${compiled.slot}:${compiled.reason}`,
    }
  }

  const execDomain = input.executeDomain ?? executeDomainQueryShadow
  let domainResult: import('./observations').DomainQueryResult
  try {
    domainResult = await execDomain(compiled.query)
  } catch (e) {
    return {
      ok: false,
      classification: 'shadow_error',
      reason: e instanceof Error ? e.message : 'domain_exec_exception',
    }
  }

  if (!domainResult.ok) {
    return {
      ok: false,
      classification: 'shadow_error',
      reason: domainResult.failure.detail,
    }
  }

  const filters = domainQueryToLegacyFilters(compiled.query)
  const primary: G4CollectionPrimaryResult = {
    observation: domainResult.observation,
    domainQuery: compiled.query,
    activeCollection: {
      resource: 'weddings',
      query: compiled.query,
      filters,
      memberIds: domainResult.activeCollection.memberIds,
      resultCount: domainResult.activeCollection.resultCount,
    },
    activeResource: null,
    baseline: {
      classification: 'baseline_skipped',
      collectionQuery: null,
      reasons: [],
    },
  }

  // --- Migration baseline (comparison only; never mutates primary) ---
  if (!input.disableBaseline && input.baselineCollectionQuery) {
    try {
      const cq = input.baselineCollectionQuery
      const rows = input.loadBaselineRows
        ? await input.loadBaselineRows()
        : (await weddingListLightService.listWeddingsForList())
            .filter(isIncludedWedding)
            .map(weddingToCollectionRow)
      const cqOnRows = executeCollectionQueryOnRows(rows, cq)
      const agreement = computeDomainQueryAgreement({
        collectionQuery: cq,
        collectionExec: cqOnRows,
        domainQuery: compiled.query,
        domainObservation: domainResult.observation,
        domainMemberIds: domainResult.activeCollection.memberIds,
      })
      primary.baseline = {
        classification: agreement.agree ? 'agree' : 'mismatch',
        collectionQuery: cq,
        reasons: agreement.reasons,
      }
    } catch (e) {
      primary.baseline = {
        classification: 'baseline_error',
        collectionQuery: input.baselineCollectionQuery,
        reasons: [e instanceof Error ? e.message : 'baseline_exception'],
      }
      // Primary unchanged
    }
  }

  return { ok: true, result: primary }
}

/** Boundary adapt for callers that still expect CollectionObservation shape. */
export function domainQueryObservationToCollectionObservation(
  obs: DomainQueryObservation,
): CollectionObservation {
  const filters = domainQueryToLegacyFilters(obs.query)
  const operation =
    obs.aggregate === 'list' || obs.aggregate === null
      ? 'list'
      : obs.aggregate === 'count'
        ? 'count'
        : obs.aggregate === 'sum'
          ? 'sum'
          : 'list'
  const metric =
    obs.measure === 'wedding.contract_value'
      ? 'contract_value'
      : obs.measure === 'wedding.paid_amount'
        ? 'paid'
        : obs.measure === 'wedding.remaining_amount'
          ? 'remaining'
          : null
  return {
    kind: 'collection',
    resource: 'wedding',
    operation,
    filters: {
      dateRange: filters.dateRange,
      locationQuery: filters.locationQuery,
      locationRole: filters.locationRole,
      label: null,
    },
    totalCount: obs.totalCount,
    returnedCount: obs.returnedCount,
    truncated: obs.truncated,
    metric,
    amount: obs.amount,
    currency: obs.currency,
    items: obs.items,
  }
}
