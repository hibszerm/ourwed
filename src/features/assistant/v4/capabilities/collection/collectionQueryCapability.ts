/**
 * Phase 3D / G4 — collection.query capability.
 * G4: DomainQuery is PRIMARY V4 shadow execution for count/list/sum.
 * CollectionQuery is migration baseline / rank legacy only.
 */

import type { AssistantObservation } from '../../observations/types'
import type { ResolvedTask } from '../../resolver/types'
import { CapabilityDomainError } from '../errors'
import type {
  CapabilityBuildInputResult,
  CapabilityDefinition,
  CollectionQueryInput,
} from '../types'
import {
  type CollectionQuery,
  type CollectionQueryMetric,
  validateCollectionQuery,
} from './collectionQueryContract'
import { executeCollectionQuery } from './executeCollectionQuery'
import { compileResolvedSemanticsToDomainQuery } from '../../domainQuery/compileResolvedSemantics'
import {
  domainQueryObservationToCollectionObservation,
  executeCollectionDomainQueryPrimary,
  type G4BaselineClassification,
} from '../../domainQuery/executeCollectionDomainQueryPrimary'
import type { DomainQuery } from '../../domainQuery/domainQuery'

/** Carried on successful execution for shadow state reducer (not model-facing). */
export type CollectionQueryExecutionExtras = {
  activeCollection: {
    resource: 'weddings'
    /** G4 semantic identity when DomainQuery primary succeeded. */
    query?: DomainQuery
    filters: {
      dateRange?: { from: string; to: string } | null
      locationQuery?: string | null
      locationRole?: 'preparations' | 'ceremony' | 'reception' | 'any' | null
    }
    memberIds: string[]
    resultCount: number
    label?: string
  }
  activeResource: {
    kind: 'wedding'
    id: string
    label: string
  } | null
  /** G4 migration diagnostic. */
  g4Baseline?: {
    classification: G4BaselineClassification
    reasons: string[]
  }
}

let lastExecutionExtras: CollectionQueryExecutionExtras | null = null
/** Last baseline CollectionQuery — G2 diagnostics only. */
let lastExecutedCollectionQuery: CollectionQuery | null = null
/** Test hook: disable CollectionQuery baseline (authority proof). */
let g4DisableBaseline = false

export function consumeCollectionQueryExecutionExtras(): CollectionQueryExecutionExtras | null {
  const x = lastExecutionExtras
  lastExecutionExtras = null
  return x
}

export function peekCollectionQueryExecutionExtras(): CollectionQueryExecutionExtras | null {
  return lastExecutionExtras
}

/** Test-only: seed reducer extras without live list-light. */
export function stashCollectionQueryExecutionExtrasForTests(
  extras: CollectionQueryExecutionExtras,
): void {
  lastExecutionExtras = extras
}

export function peekLastExecutedCollectionQuery(): CollectionQuery | null {
  return lastExecutedCollectionQuery
}

export function clearLastExecutedCollectionQuery(): void {
  lastExecutedCollectionQuery = null
}

/** Test-only: prove primary path works without CollectionQuery baseline. */
export function setG4DisableBaselineForTests(disabled: boolean): void {
  g4DisableBaseline = disabled
}

function mapMetric(subject: ResolvedTask['subject']): CollectionQueryMetric | null {
  if (subject === 'contract_value') return 'contract_value'
  if (subject === 'paid') return 'paid'
  if (subject === 'remaining') return 'remaining'
  return null
}

function isWeddingCollectionSubject(subject: ResolvedTask['subject']): boolean {
  return (
    subject === 'wedding' ||
    subject === 'contract_value' ||
    subject === 'paid' ||
    subject === 'remaining' ||
    subject === 'payment' ||
    subject === null
  )
}

export function isCollectionQueryShapedTask(resolved: ResolvedTask): boolean {
  if (
    resolved.op !== 'count' &&
    resolved.op !== 'sum' &&
    resolved.op !== 'rank' &&
    resolved.op !== 'list'
  ) {
    return false
  }
  if (resolved.subject === 'session') return false
  if (
    resolved.collection?.resource === 'sessions' ||
    resolved.collection?.resource === 'assignments'
  ) {
    return false
  }
  if (!isWeddingCollectionSubject(resolved.subject)) return false
  return true
}

/**
 * Build CollectionQuery for migration baseline / rank legacy.
 * NOT an input to DomainQuery compilation.
 */
export function buildCollectionQueryFromResolved(
  resolved: ResolvedTask,
):
  | { ok: true; query: CollectionQuery }
  | { ok: false; reason: 'needs_clarification' | 'invalid_input'; safeCode: string } {
  const op = resolved.op
  if (op !== 'count' && op !== 'sum' && op !== 'rank' && op !== 'list') {
    return { ok: false, reason: 'invalid_input', safeCode: 'not_collection_op' }
  }

  const metric = mapMetric(resolved.subject)
  if ((op === 'sum' || op === 'rank') && !metric) {
    return {
      ok: false,
      reason: 'needs_clarification',
      safeCode: 'collection_metric_required',
    }
  }

  const temporalRange =
    resolved.temporal?.from && resolved.temporal?.to
      ? { from: resolved.temporal.from, to: resolved.temporal.to }
      : null

  const activeFilters = resolved.collection?.filters
  const claimsActiveCollection =
    resolved.sourceTaskSpec.resource?.kind === 'active_collection' ||
    resolved.mergedTaskSpec.resource?.kind === 'active_collection' ||
    resolved.sourceTaskSpec.fieldSource.resource === 'inherit' ||
    resolved.mergedTaskSpec.fieldSource.resource === 'inherit'

  const explicitLocation =
    resolved.qualifiers.titleHint?.trim() &&
    resolved.qualifiers.titleHint.trim().length >= 2
      ? resolved.qualifiers.titleHint.trim()
      : null

  const usedActive =
    Boolean(resolved.collection) &&
    (claimsActiveCollection ||
      (!temporalRange && Boolean(activeFilters?.dateRange)) ||
      (!explicitLocation && Boolean(activeFilters?.locationQuery)))

  const dateRange = temporalRange ?? activeFilters?.dateRange ?? null
  const locationQuery =
    explicitLocation ?? activeFilters?.locationQuery ?? null

  const dest = resolved.qualifiers.destination
  const explicitRole =
    dest === 'preparations' || dest === 'ceremony' || dest === 'reception'
      ? dest
      : null
  const locationRole =
    explicitRole ??
    activeFilters?.locationRole ??
    (locationQuery ? ('any' as const) : null)

  if (
    (op === 'sum' || op === 'rank' || op === 'list') &&
    claimsActiveCollection &&
    !resolved.collection
  ) {
    return {
      ok: false,
      reason: 'needs_clarification',
      safeCode: 'no_active_collection',
    }
  }

  const rank =
    op === 'rank'
      ? {
          direction:
            resolved.qualifiers.rank === 'min' ? ('asc' as const) : ('desc' as const),
          limit: 1,
        }
      : null

  const candidate = {
    resource: 'wedding' as const,
    operation: op,
    filters: {
      dateRange,
      locationQuery,
      locationRole,
    },
    metric: metric ?? null,
    rank,
    limit: op === 'list' ? 20 : null,
    usedActiveCollection: usedActive,
  }

  const validated = validateCollectionQuery(candidate)
  if (!validated.ok) {
    return { ok: false, reason: 'invalid_input', safeCode: validated.reason }
  }
  return { ok: true, query: validated.query }
}

function canHandle(resolved: ResolvedTask): boolean {
  return isCollectionQueryShapedTask(resolved)
}

function buildInput(resolved: ResolvedTask): CapabilityBuildInputResult {
  if (!isCollectionQueryShapedTask(resolved)) {
    return {
      ok: false,
      reason: 'invalid_input',
      safeCode: 'not_collection_shaped',
    }
  }
  const built = buildCollectionQueryFromResolved(resolved)
  if (!built.ok) {
    if (built.reason === 'needs_clarification') {
      return {
        ok: false,
        reason: 'needs_clarification',
        missingSlot: 'subject',
        safeCode: built.safeCode,
      }
    }
    return {
      ok: false,
      reason: 'invalid_input',
      safeCode: built.safeCode,
    }
  }
  const input: CollectionQueryInput = {
    resolved,
    baselineCollectionQuery: built.query,
    query: built.query,
  }
  return { ok: true, input }
}

export const collectionQueryCapability: CapabilityDefinition = {
  id: 'collection.query',
  kind: 'query',
  resource: 'collection',
  description:
    'G4: DomainQuery-primary count/list/sum; CollectionQuery baseline/rank legacy.',
  riskLevel: 'low',
  requiresConfirmation: false,
  canHandle: (resolved) => canHandle(resolved),
  buildInput: (resolved) => buildInput(resolved),
  async execute(input): Promise<AssistantObservation> {
    const collectionInput = input as CollectionQueryInput
    const resolved = collectionInput.resolved

    // G4 primary: DomainQuery from ResolvedTask (never from CollectionQuery).
    const compiled = compileResolvedSemanticsToDomainQuery(resolved)
    if (compiled.status === 'success') {
      const primary = await executeCollectionDomainQueryPrimary({
        resolved,
        baselineCollectionQuery: collectionInput.baselineCollectionQuery,
        disableBaseline: g4DisableBaseline,
      })
      if (!primary.ok) {
        throw new CapabilityDomainError({
          safeCode: primary.reason,
          executionStatus: 'error',
        })
      }
      lastExecutedCollectionQuery =
        collectionInput.baselineCollectionQuery ?? null
      lastExecutionExtras = {
        activeCollection: {
          resource: 'weddings',
          query: primary.result.activeCollection.query,
          filters: primary.result.activeCollection.filters,
          memberIds: primary.result.activeCollection.memberIds,
          resultCount: primary.result.activeCollection.resultCount,
        },
        activeResource: primary.result.activeResource,
        g4Baseline: {
          classification: primary.result.baseline.classification,
          reasons: primary.result.baseline.reasons,
        },
      }
      // Primary observation is DomainQueryObservation.
      return primary.result.observation
    }

    // Outside G4 slice (e.g. rank) — legacy CollectionQuery execution only.
    const baseline = collectionInput.baselineCollectionQuery
    if (!baseline) {
      throw new CapabilityDomainError({
        safeCode:
          compiled.status === 'unsupported'
            ? compiled.reason
            : `${compiled.slot}:${compiled.reason}`,
        executionStatus: 'error',
      })
    }
    const validated = validateCollectionQuery(baseline)
    if (!validated.ok) {
      throw new CapabilityDomainError({
        safeCode: validated.reason,
        executionStatus: 'error',
      })
    }
    const result = await executeCollectionQuery(validated.query)
    lastExecutedCollectionQuery = validated.query
    lastExecutionExtras = {
      activeCollection: result.activeCollection,
      activeResource: result.activeResource,
      g4Baseline: {
        classification: 'legacy_only',
        reasons: [compiled.status === 'unsupported' ? compiled.reason : compiled.reason],
      },
    }
    return result.observation
  },
}

export { domainQueryObservationToCollectionObservation }
