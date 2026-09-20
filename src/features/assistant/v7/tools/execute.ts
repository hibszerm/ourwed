/**
 * V7 tool execution — one gate, CRA2 registry + canonical adapters.
 * No TurnPlan, no verifier, no ConversationCollection algebra.
 * Supports first-class wedding + session ResourceSets.
 */

import type { CollectionMoneyRow } from '../../v4/capabilities/collection/executeCollectionQuery'
import {
  evaluateConceptPredicates,
  type PredicateBatchOptions,
} from '../../shared/adapters/predicateBatch'
import { inspectConcept } from '../../shared/adapters/inspectAdapters'
import { getConceptSortValue } from '../../shared/adapters/sortValues'
import { listRelation } from '../../shared/adapters/relationAdapters'
import {
  WeddingReadContext,
  type WeddingReadContextOverrides,
} from '../../shared/adapters/WeddingReadContext'
import {
  SessionReadContext,
  type SessionReadContextOverrides,
} from '../../shared/adapters/SessionReadContext'
import {
  inspectSessionConcept,
  linkedWeddingRelatedItems,
} from '../../shared/adapters/sessionInspectAdapters'
import { evaluateSessionConceptPredicates } from '../../shared/adapters/sessionPredicateBatch'
import { loadWeddingUniverseRows } from '../../shared/execution/weddingUniverse'
import {
  loadSessionUniverseRows,
  type SessionCollectionRow,
} from '../../shared/execution/sessionUniverse'
import {
  V6_LIST_RELATED_HARD_CAP,
  getConcept,
  type ConceptKey,
} from '../../shared/registry'
import type { V7ResourceSetStore } from '../resourceSet/store'
import type { V7ResourceType, V7SessionBinding } from '../resourceSet/types'
import { getActiveV7LatencyTrace } from '../diagnostics/latencyTrace'
import {
  assertAggregation,
  assertConceptMatchesResource,
  assertInspectProjection,
  assertSort,
  authorizePredicates,
  rejectIdentityInjection,
  resolveConceptKey,
  resolveRelationKey,
  validateDateBounds,
  validateLimit,
} from './authorize'
import { toolErr, type V7ToolResult } from './errors'
import type {
  V7AggregateArgs,
  V7DescribeSetArgs,
  V7InspectArgs,
  V7ListRelatedArgs,
  V7RefineArgs,
  V7SearchArgs,
  V7SearchProductKnowledgeArgs,
  V7SelectNearestAssignmentsArgs,
  V7SortArgs,
} from './types'
import {
  selectCombinedAssignments,
  type CombinedAssignmentCandidate,
} from '../assignments/selectCombinedAssignments'
import { searchProductKnowledge } from '../knowledge/search'
import {
  isV7BlockedDisposition,
  parseV7TurnDisposition,
  V7_REPORT_TURN_SCOPE_TOOL,
} from '../agent/domainDisposition'

export type V7ToolDeps = PredicateBatchOptions & {
  loadUniverseRows?: () => Promise<CollectionMoneyRow[]>
  loadSessionUniverseRows?: () => Promise<SessionCollectionRow[]>
  contextOptions?: WeddingReadContextOverrides
  sessionContextOptions?: SessionReadContextOverrides
  /** Optional display-name resolver for describe (defaults to light label). */
  todayKey?: string
}

export type V7ToolContext = {
  store: V7ResourceSetStore
  binding: V7SessionBinding
  deps?: V7ToolDeps
  /**
   * A1 — when true, business tools must not execute (blocked disposition).
   * report_turn_scope still records the disposition result.
   */
  blockBusinessTools?: boolean
}

const DESCRIBE_PREVIEW_CAP = 12

function parseResourceType(
  raw: string | undefined,
): V7ResourceType | null {
  if (raw == null || raw === 'wedding') return 'wedding'
  if (raw === 'session') return 'session'
  return null
}

function loadWeddingUniverse(deps?: V7ToolDeps): Promise<CollectionMoneyRow[]> {
  return (deps?.loadUniverseRows ?? loadWeddingUniverseRows)()
}

function loadSessionUniverse(
  deps?: V7ToolDeps,
): Promise<SessionCollectionRow[]> {
  return (deps?.loadSessionUniverseRows ?? loadSessionUniverseRows)()
}

function filterByDateBounds<T extends { date: string | null }>(
  rows: T[],
  dateStart?: string,
  dateEnd?: string,
): T[] {
  return rows.filter((row) => {
    const d = row.date
    if (!d) return false
    if (dateStart && d < dateStart) return false
    if (dateEnd && d > dateEnd) return false
    return true
  })
}

function compareSortValues(
  av: string | number | null,
  bv: string | number | null,
  direction: 'asc' | 'desc',
): number {
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  const cmp =
    typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'pl')
  return direction === 'asc' ? cmp : -cmp
}

function weddingLightSortValue(
  row: CollectionMoneyRow,
  concept: ConceptKey,
): number | string | null {
  if (concept === 'FIN.CONTRACT_VALUE') return row.contractValue
  if (concept === 'FIN.TOTAL_PAID') return row.paidAmount
  if (concept === 'FIN.REMAINING_TO_PAY') return row.remainingAmount
  if (concept === 'WEDDING.DATE') return row.date
  if (concept === 'WEDDING.DISPLAY_NAME') return row.displayLabel
  return null
}

function sessionLightSortValue(
  row: SessionCollectionRow,
  concept: ConceptKey,
): number | string | null {
  if (concept === 'SESSION.DATE') return row.date
  if (concept === 'SESSION.DISPLAY_NAME') return row.displayLabel
  if (concept === 'SESSION.TOTAL_PRICE') return row.contractValue
  if (concept === 'SESSION.TOTAL_PAID') return row.paidAmount
  if (concept === 'SESSION.REMAINING_TO_PAY') return row.remainingAmount
  if (concept === 'SESSION.DEPOSIT_AMOUNT') return row.depositAmount
  return null
}

function isWeddingLightSortable(concept: ConceptKey): boolean {
  return (
    concept === 'FIN.CONTRACT_VALUE' ||
    concept === 'FIN.TOTAL_PAID' ||
    concept === 'FIN.REMAINING_TO_PAY' ||
    concept === 'WEDDING.DATE' ||
    concept === 'WEDDING.DISPLAY_NAME'
  )
}

function isSessionLightSortable(concept: ConceptKey): boolean {
  return (
    concept === 'SESSION.DATE' ||
    concept === 'SESSION.DISPLAY_NAME' ||
    concept === 'SESSION.TOTAL_PRICE' ||
    concept === 'SESSION.TOTAL_PAID' ||
    concept === 'SESSION.REMAINING_TO_PAY' ||
    concept === 'SESSION.DEPOSIT_AMOUNT'
  )
}

function sortWeddingRowsByConcept(
  rows: CollectionMoneyRow[],
  concept: ConceptKey,
  direction: 'asc' | 'desc',
): CollectionMoneyRow[] {
  return [...rows].sort((a, b) =>
    compareSortValues(
      weddingLightSortValue(a, concept),
      weddingLightSortValue(b, concept),
      direction,
    ),
  )
}

function sortSessionRowsByConcept(
  rows: SessionCollectionRow[],
  concept: ConceptKey,
  direction: 'asc' | 'desc',
): SessionCollectionRow[] {
  return [...rows].sort((a, b) =>
    compareSortValues(
      sessionLightSortValue(a, concept),
      sessionLightSortValue(b, concept),
      direction,
    ),
  )
}

/**
 * Phase 2K.10-R1 — when the light-sort path loads the studio universe,
 * return it so rich-sort evidence can reuse display_name without a second load.
 * Heavy sort returns universe: null (evidence may load once if needed).
 */
async function sortWeddingIdsByConcept(
  ids: readonly string[],
  concept: ConceptKey,
  direction: 'asc' | 'desc',
  deps?: V7ToolDeps,
): Promise<{ ids: string[]; universe: CollectionMoneyRow[] | null }> {
  if (isWeddingLightSortable(concept)) {
    const universe = await loadWeddingUniverse(deps)
    const map = new Map(universe.map((r) => [r.id, r]))
    const rows = ids
      .map((id) => map.get(id))
      .filter((r): r is CollectionMoneyRow => !!r)
    return {
      ids: sortWeddingRowsByConcept(rows, concept, direction).map((r) => r.id),
      universe,
    }
  }

  const values = await Promise.all(
    ids.map(async (id) => ({
      id,
      value: await getConceptSortValue(id, concept, deps?.contextOptions),
    })),
  )
  values.sort((a, b) =>
    compareSortValues(
      a.value as string | number | null,
      b.value as string | number | null,
      direction,
    ),
  )
  return { ids: values.map((v) => v.id), universe: null }
}

async function sortSessionIdsByConcept(
  ids: readonly string[],
  concept: ConceptKey,
  direction: 'asc' | 'desc',
  deps?: V7ToolDeps,
): Promise<{ ids: string[]; universe: SessionCollectionRow[] | null }> {
  if (isSessionLightSortable(concept)) {
    const universe = await loadSessionUniverse(deps)
    const map = new Map(universe.map((r) => [r.id, r]))
    const rows = ids
      .map((id) => map.get(id))
      .filter((r): r is SessionCollectionRow => !!r)
    return {
      ids: sortSessionRowsByConcept(rows, concept, direction).map((r) => r.id),
      universe,
    }
  }

  const values = await Promise.all(
    ids.map(async (id) => {
      const inspected = await inspectSessionConcept(
        new SessionReadContext(id, deps?.sessionContextOptions),
        concept,
      )
      const value = inspected.value
      const scalar =
        value == null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
          ? (value as string | number | boolean | null)
          : null
      return {
        id,
        value:
          typeof scalar === 'boolean'
            ? scalar
              ? 1
              : 0
            : (scalar as string | number | null),
      }
    }),
  )
  values.sort((a, b) => compareSortValues(a.value, b.value, direction))
  return { ids: values.map((v) => v.id), universe: null }
}

function scrubIds(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const scrubbed = { ...(value as Record<string, unknown>) }
  for (const k of Object.keys(scrubbed)) {
    if (/id$/i.test(k) || k === 'id') delete scrubbed[k]
  }
  return scrubbed
}


type InspectFieldRow = {
  concept: string
  value: unknown
  filled: boolean
  display_text?: string | null
  privacy: string
}

/**
 * Shared inspect field loader — used by inspect_resource and sort evidence.
 * Same authorize gates must be applied by the caller before invoking.
 */
async function loadInspectFieldsForMember(input: {
  resourceType: V7ResourceType
  memberId: string
  conceptKeys: ConceptKey[]
  deps?: V7ToolDeps
}): Promise<InspectFieldRow[]> {
  const sharedWeddingCtx =
    input.resourceType === 'wedding'
      ? new WeddingReadContext(input.memberId, input.deps?.contextOptions)
      : null
  const sharedSessionCtx =
    input.resourceType === 'session'
      ? new SessionReadContext(input.memberId, input.deps?.sessionContextOptions)
      : null

  const fields: InspectFieldRow[] = []
  for (const key of input.conceptKeys) {
    const inspected =
      input.resourceType === 'session'
        ? await inspectSessionConcept(sharedSessionCtx!, key)
        : await inspectConcept(sharedWeddingCtx!, key)
    fields.push({
      concept: key,
      value: scrubIds(inspected.value),
      filled: inspected.filled,
      display_text: inspected.displayText ?? null,
      privacy: getConcept(key).privacy,
    })
  }
  return fields
}

const SORT_EVIDENCE_MEMBER_CAP = 12


function publicHandleView(record: {
  handle: string
  count: number
  description: string
  resourceType: string
}) {
  return {
    handle: record.handle,
    count: record.count,
    description: record.description,
    resource_type: record.resourceType,
  }
}

function resourceNoun(resourceType: V7ResourceType, count: number): string {
  if (resourceType === 'session') {
    return count === 1 ? 'sesji' : 'sesji'
  }
  return count === 1 ? 'wesela' : 'wesel'
}

export async function searchResources(
  ctx: V7ToolContext,
  args: V7SearchArgs,
): Promise<
  V7ToolResult<{
    handle: string
    count: number
    description: string
    resource_type: string
  }>
> {
  const idErr = rejectIdentityInjection(args as Record<string, unknown>)
  if (idErr) return idErr
  if (ctx.store.isClosed) return toolErr('SESSION_CLOSED', 'session_closed')

  const resourceType = parseResourceType(args.resource_type)
  if (!resourceType) {
    return toolErr('UNSUPPORTED_RESOURCE_TYPE', 'unsupported_resource_type')
  }
  const dateErr = validateDateBounds(args.date_start, args.date_end)
  if (dateErr) return dateErr
  const limitErr = validateLimit(args.limit)
  if (limitErr) return limitErr

  const predicates = args.predicates ?? []
  const authPred = authorizePredicates(predicates, resourceType)
  if (!authPred.ok) return authPred

  let sortConcept: ConceptKey | null = null
  const direction = args.sort?.direction ?? 'asc'
  if (args.sort?.concept) {
    const resolved = resolveConceptKey(args.sort.concept)
    if (!resolved.ok) return resolved
    const matchErr = assertConceptMatchesResource(resolved.key, resourceType)
    if (matchErr) return matchErr
    const sortErr = assertSort(resolved.key)
    if (sortErr) return sortErr
    sortConcept = resolved.key
  }

  const boundParts: string[] = []
  if (args.date_start || args.date_end) {
    boundParts.push(
      `daty ${args.date_start ?? '…'}–${args.date_end ?? '…'}`,
    )
  }
  if (authPred.normalized.length) {
    boundParts.push(`${authPred.normalized.length} filtr(ów)`)
  }
  if (args.limit) boundParts.push(`limit ${args.limit}`)

  if (resourceType === 'session') {
    const universe = await loadSessionUniverse(ctx.deps)
    let rows = filterByDateBounds(universe, args.date_start, args.date_end)
    let ids = rows.map((r) => r.id)

    if (authPred.normalized.length > 0) {
      const batch = await evaluateSessionConceptPredicates(
        ids,
        authPred.normalized,
        {
          loadSessionUniverseRows: ctx.deps?.loadSessionUniverseRows,
          sessionContextOptions: ctx.deps?.sessionContextOptions,
        },
      )
      if (!batch.ok) {
        if (batch.code === 'CANDIDATE_CAP_EXCEEDED') {
          return toolErr('CANDIDATE_CAP_EXCEEDED', 'candidate_cap_exceeded')
        }
        return toolErr('VALIDATION_ERROR', 'predicate_failed')
      }
      const matched = new Set(batch.matchedIds)
      ids = ids.filter((id) => matched.has(id))
      rows = rows.filter((r) => matched.has(r.id))
    }

    if (sortConcept) {
      const sorted = await sortSessionIdsByConcept(
        ids,
        sortConcept,
        direction,
        ctx.deps,
      )
      ids = sorted.ids
    } else {
      rows = sortSessionRowsByConcept(rows, 'SESSION.DATE', 'asc')
      ids = rows.map((r) => r.id)
    }

    if (args.limit != null) ids = ids.slice(0, args.limit)

    const description =
      ids.length === 0
        ? `Pusty zestaw sesji${boundParts.length ? ` (${boundParts.join(', ')})` : ''}`
        : `Zestaw ${ids.length} ${resourceNoun('session', ids.length)}${boundParts.length ? ` (${boundParts.join(', ')})` : ''}`

    const record = ctx.store.create({
      resourceType: 'session',
      memberIds: ids,
      description,
    })
    return { ok: true, ...publicHandleView(record) }
  }

  const universe = await loadWeddingUniverse(ctx.deps)
  let rows = filterByDateBounds(universe, args.date_start, args.date_end)
  let ids = rows.map((r) => r.id)

  if (authPred.normalized.length > 0) {
    const batch = await evaluateConceptPredicates(
      ids,
      authPred.normalized,
      ctx.deps ?? {},
    )
    if (!batch.ok) {
      if (batch.code === 'CANDIDATE_CAP_EXCEEDED') {
        return toolErr('CANDIDATE_CAP_EXCEEDED', 'candidate_cap_exceeded')
      }
      return toolErr('VALIDATION_ERROR', 'predicate_failed')
    }
    const matched = new Set(batch.matchedIds)
    ids = ids.filter((id) => matched.has(id))
    rows = rows.filter((r) => matched.has(r.id))
  }

  if (sortConcept) {
    const sorted = await sortWeddingIdsByConcept(
      ids,
      sortConcept,
      direction,
      ctx.deps,
    )
    ids = sorted.ids
  } else {
    rows = sortWeddingRowsByConcept(rows, 'WEDDING.DATE', 'asc')
    ids = rows.map((r) => r.id)
  }

  if (args.limit != null) {
    ids = ids.slice(0, args.limit)
  }

  const description =
    ids.length === 0
      ? `Pusty zestaw wesel${boundParts.length ? ` (${boundParts.join(', ')})` : ''}`
      : `Zestaw ${ids.length} ${resourceNoun('wedding', ids.length)}${boundParts.length ? ` (${boundParts.join(', ')})` : ''}`

  const record = ctx.store.create({
    resourceType: 'wedding',
    memberIds: ids,
    description,
  })
  return { ok: true, ...publicHandleView(record) }
}

export async function refineResources(
  ctx: V7ToolContext,
  args: V7RefineArgs,
): Promise<
  V7ToolResult<{
    handle: string
    count: number
    description: string
    resource_type: string
    parent_handle: string
  }>
> {
  const idErr = rejectIdentityInjection(args as Record<string, unknown>)
  if (idErr) return idErr
  if (!args.handle || typeof args.handle !== 'string') {
    return toolErr('VALIDATION_ERROR', 'handle_required')
  }
  if (!Array.isArray(args.predicates) || args.predicates.length === 0) {
    return toolErr('VALIDATION_ERROR', 'predicates_required')
  }

  const got = ctx.store.get(args.handle, ctx.binding)
  if (!got.ok) return toolErr(got.code, got.code.toLowerCase())

  const parent = got.record
  const authPred = authorizePredicates(args.predicates, parent.resourceType)
  if (!authPred.ok) return authPred

  const batch =
    parent.resourceType === 'session'
      ? await evaluateSessionConceptPredicates(
          [...parent.memberIds],
          authPred.normalized,
          {
            loadSessionUniverseRows: ctx.deps?.loadSessionUniverseRows,
            sessionContextOptions: ctx.deps?.sessionContextOptions,
          },
        )
      : await evaluateConceptPredicates(
          [...parent.memberIds],
          authPred.normalized,
          ctx.deps ?? {},
        )
  if (!batch.ok) {
    if (batch.code === 'CANDIDATE_CAP_EXCEEDED') {
      return toolErr('CANDIDATE_CAP_EXCEEDED', 'candidate_cap_exceeded')
    }
    return toolErr('VALIDATION_ERROR', 'predicate_failed')
  }

  const matched = new Set(batch.matchedIds)
  const childIds = parent.memberIds.filter((id) => matched.has(id))
  const description =
    childIds.length === 0
      ? `Pusty podzestaw z ${parent.handle}`
      : `Podzestaw ${childIds.length} z ${parent.count} (filtr)`

  const record = ctx.store.create({
    resourceType: parent.resourceType,
    memberIds: childIds,
    description,
  })
  return {
    ok: true,
    ...publicHandleView(record),
    parent_handle: parent.handle,
  }
}

export async function sortResources(
  ctx: V7ToolContext,
  args: V7SortArgs,
): Promise<
  V7ToolResult<{
    handle: string
    count: number
    description: string
    resource_type: string
    parent_handle: string
    evidence?: Array<{
      ordinal: number
      display_name: string | null
      fields: InspectFieldRow[]
    }>
  }>
> {
  const idErr = rejectIdentityInjection(args as Record<string, unknown>)
  if (idErr) return idErr
  if (!args.handle) return toolErr('VALIDATION_ERROR', 'handle_required')
  const limitErr = validateLimit(args.limit)
  if (limitErr) return limitErr

  const got = ctx.store.get(args.handle, ctx.binding)
  if (!got.ok) return toolErr(got.code, got.code.toLowerCase())

  const resolved = resolveConceptKey(args.concept)
  if (!resolved.ok) return resolved
  const matchErr = assertConceptMatchesResource(
    resolved.key,
    got.record.resourceType,
  )
  if (matchErr) return matchErr
  const sortErr = assertSort(resolved.key)
  if (sortErr) return sortErr

  // Optional model-chosen evidence — validate before sorting so invalid args fail closed.
  const rawEvidence = args.evidence_concepts
  let evidenceKeys: ConceptKey[] | null = null
  if (rawEvidence != null) {
    if (!Array.isArray(rawEvidence) || rawEvidence.length === 0) {
      return toolErr('VALIDATION_ERROR', 'evidence_concepts_required_when_present')
    }
    if (rawEvidence.length > 12) {
      return toolErr('VALIDATION_ERROR', 'too_many_evidence_concepts')
    }
    evidenceKeys = []
    for (const raw of rawEvidence) {
      const ev = resolveConceptKey(raw)
      if (!ev.ok) return ev
      const evMatch = assertConceptMatchesResource(
        ev.key,
        got.record.resourceType,
      )
      if (evMatch) return evMatch
      const projErr = assertInspectProjection(ev.key)
      if (projErr) return projErr
      evidenceKeys.push(ev.key)
    }
  }

  const direction = args.direction ?? 'asc'
  let sortedUniverse:
    | CollectionMoneyRow[]
    | SessionCollectionRow[]
    | null = null
  let ids: string[]
  if (got.record.resourceType === 'session') {
    const sorted = await sortSessionIdsByConcept(
      got.record.memberIds,
      resolved.key,
      direction,
      ctx.deps,
    )
    ids = sorted.ids
    sortedUniverse = sorted.universe
  } else {
    const sorted = await sortWeddingIdsByConcept(
      got.record.memberIds,
      resolved.key,
      direction,
      ctx.deps,
    )
    ids = sorted.ids
    sortedUniverse = sorted.universe
  }
  if (args.limit != null) ids = ids.slice(0, args.limit)

  const description = `Posortowano ${ids.length} po ${resolved.key} ${direction}${
    args.limit ? ` (top ${args.limit})` : ''
  }`
  const record = ctx.store.create({
    resourceType: got.record.resourceType,
    memberIds: ids,
    description,
  })

  const base = {
    ok: true as const,
    ...publicHandleView(record),
    parent_handle: got.record.handle,
  }

  if (!evidenceKeys) {
    return base
  }

  const auditTrace = getActiveV7LatencyTrace()
  const evidenceT0 = Date.now()
  const evidenceIds = ids.slice(0, SORT_EVIDENCE_MEMBER_CAP)
  auditTrace?.mark('sort_evidence_start', {
    conceptCount: evidenceKeys.length,
    memberCount: evidenceIds.length,
  })

  const evidence: Array<{
    ordinal: number
    display_name: string | null
    fields: InspectFieldRow[]
  }> = []

  // 2K.10-R1 — reuse sort-time universe for display_name (no second full-studio load).
  if (got.record.resourceType === 'session') {
    const universe =
      (sortedUniverse as SessionCollectionRow[] | null) ??
      (await loadSessionUniverse(ctx.deps))
    for (let i = 0; i < evidenceIds.length; i++) {
      const memberId = evidenceIds[i]!
      const fields = await loadInspectFieldsForMember({
        resourceType: 'session',
        memberId,
        conceptKeys: evidenceKeys,
        deps: ctx.deps,
      })
      evidence.push({
        ordinal: i + 1,
        display_name:
          universe.find((r) => r.id === memberId)?.displayLabel ?? null,
        fields,
      })
    }
  } else {
    const universe =
      (sortedUniverse as CollectionMoneyRow[] | null) ??
      (await loadWeddingUniverse(ctx.deps))
    for (let i = 0; i < evidenceIds.length; i++) {
      const memberId = evidenceIds[i]!
      const fields = await loadInspectFieldsForMember({
        resourceType: 'wedding',
        memberId,
        conceptKeys: evidenceKeys,
        deps: ctx.deps,
      })
      evidence.push({
        ordinal: i + 1,
        display_name:
          universe.find((r) => r.id === memberId)?.displayLabel ?? null,
        fields,
      })
    }
  }

  auditTrace?.mark('sort_evidence_end', {
    conceptCount: evidenceKeys.length,
    memberCount: evidence.length,
    durationMs: Date.now() - evidenceT0,
  })

  return {
    ...base,
    evidence,
  }
}

export async function aggregateResources(
  ctx: V7ToolContext,
  args: V7AggregateArgs,
): Promise<
  V7ToolResult<{
    handle: string
    operation: 'count' | 'sum'
    concept: string
    value: number
    member_count: number
    /** Aggregate does not mutate/replace the set. */
    set_unchanged: true
  }>
> {
  const idErr = rejectIdentityInjection(args as Record<string, unknown>)
  if (idErr) return idErr
  if (!args.handle) return toolErr('VALIDATION_ERROR', 'handle_required')
  if (args.operation !== 'count' && args.operation !== 'sum') {
    return toolErr('VALIDATION_ERROR', 'operation_must_be_count_or_sum')
  }

  const got = ctx.store.get(args.handle, ctx.binding)
  if (!got.ok) return toolErr(got.code, got.code.toLowerCase())

  const resolved = resolveConceptKey(args.concept)
  if (!resolved.ok) return resolved
  const matchErr = assertConceptMatchesResource(
    resolved.key,
    got.record.resourceType,
  )
  if (matchErr) return matchErr
  const aggErr = assertAggregation(resolved.key, args.operation)
  if (aggErr) return aggErr

  if (args.operation === 'count') {
    return {
      ok: true,
      handle: got.record.handle,
      operation: 'count',
      concept: resolved.key,
      value: got.record.count,
      member_count: got.record.count,
      set_unchanged: true,
    }
  }

  let sum = 0
  if (got.record.resourceType === 'session') {
    const universe = await loadSessionUniverse(ctx.deps)
    const map = new Map(universe.map((r) => [r.id, r]))
    for (const id of got.record.memberIds) {
      const row = map.get(id)
      if (resolved.key === 'SESSION.REMAINING_TO_PAY') {
        sum += row?.remainingAmount ?? 0
      } else if (resolved.key === 'SESSION.TOTAL_PAID') {
        sum += row?.paidAmount ?? 0
      } else if (resolved.key === 'SESSION.TOTAL_PRICE') {
        sum += row?.contractValue ?? 0
      } else if (resolved.key === 'SESSION.DEPOSIT_AMOUNT') {
        sum += row?.depositAmount ?? 0
      } else {
        const inspected = await inspectSessionConcept(
          new SessionReadContext(id, ctx.deps?.sessionContextOptions),
          resolved.key,
        )
        if (typeof inspected.value === 'number') sum += inspected.value
      }
    }
  } else {
    const universe = await loadWeddingUniverse(ctx.deps)
    const map = new Map(universe.map((r) => [r.id, r]))
    for (const id of got.record.memberIds) {
      const row = map.get(id)
      if (resolved.key === 'FIN.REMAINING_TO_PAY') {
        sum += row?.remainingAmount ?? 0
      } else if (resolved.key === 'FIN.TOTAL_PAID') {
        sum += row?.paidAmount ?? 0
      } else if (resolved.key === 'FIN.CONTRACT_VALUE') {
        sum += row?.contractValue ?? 0
      } else {
        const inspected = await inspectConcept(
          new WeddingReadContext(id, ctx.deps?.contextOptions),
          resolved.key,
        )
        if (typeof inspected.value === 'number') sum += inspected.value
      }
    }
  }

  return {
    ok: true,
    handle: got.record.handle,
    operation: 'sum',
    concept: resolved.key,
    value: sum,
    member_count: got.record.count,
    set_unchanged: true,
  }
}

export async function inspectResource(
  ctx: V7ToolContext,
  args: V7InspectArgs,
): Promise<
  V7ToolResult<{
    handle: string
    ordinal: number
    display_name: string | null
    fields: Array<{
      concept: string
      value: unknown
      filled: boolean
      display_text?: string | null
      privacy: string
    }>
  }>
> {
  const idErr = rejectIdentityInjection(args as Record<string, unknown>)
  if (idErr) return idErr
  if (!args.handle) return toolErr('VALIDATION_ERROR', 'handle_required')
  if (!Array.isArray(args.concepts) || args.concepts.length === 0) {
    return toolErr('VALIDATION_ERROR', 'concepts_required')
  }
  if (args.concepts.length > 12) {
    return toolErr('VALIDATION_ERROR', 'too_many_concepts')
  }

  const got = ctx.store.get(args.handle, ctx.binding)
  if (!got.ok) return toolErr(got.code, got.code.toLowerCase())
  if (got.record.count === 0) {
    return toolErr('ORDINAL_OUT_OF_RANGE', 'empty_set')
  }

  let ordinal = args.ordinal
  if (ordinal == null) {
    if (got.record.count !== 1) {
      return toolErr('VALIDATION_ERROR', 'ordinal_required_for_multi')
    }
    ordinal = 1
  }
  if (
    !Number.isInteger(ordinal) ||
    ordinal < 1 ||
    ordinal > got.record.count
  ) {
    return toolErr('ORDINAL_OUT_OF_RANGE', 'ordinal_out_of_range')
  }

  const memberId = got.record.memberIds[ordinal - 1]!

  const conceptKeys: ConceptKey[] = []
  for (const raw of args.concepts) {
    const resolved = resolveConceptKey(raw)
    if (!resolved.ok) return resolved
    const matchErr = assertConceptMatchesResource(
      resolved.key,
      got.record.resourceType,
    )
    if (matchErr) return matchErr
    const projErr = assertInspectProjection(resolved.key)
    if (projErr) return projErr
    conceptKeys.push(resolved.key)
  }

  // 2K.9-L — diagnostic timing only (no behavior change).
  const auditTrace = getActiveV7LatencyTrace()
  const conceptCount = conceptKeys.length
  const inspectT0 = Date.now()
  auditTrace?.mark('inspect_resource_start', {
    conceptCount,
    sharedReadContext: true,
  })

  // Phase 2K.9 — one read context per inspected member (inside helper).
  const fields = await loadInspectFieldsForMember({
    resourceType: got.record.resourceType,
    memberId,
    conceptKeys,
    deps: ctx.deps,
  })

  let display_name: string | null = null
  if (got.record.resourceType === 'session') {
    const universe = await loadSessionUniverse(ctx.deps)
    display_name = universe.find((r) => r.id === memberId)?.displayLabel ?? null
  } else {
    const universe = await loadWeddingUniverse(ctx.deps)
    display_name = universe.find((r) => r.id === memberId)?.displayLabel ?? null
  }

  auditTrace?.mark('inspect_resource_end', {
    conceptCount,
    durationMs: Date.now() - inspectT0,
    sharedReadContext: true,
    fieldCount: fields.length,
  })

  return {
    ok: true,
    handle: got.record.handle,
    ordinal,
    display_name,
    fields,
  }
}

export async function listRelatedResources(
  ctx: V7ToolContext,
  args: V7ListRelatedArgs,
): Promise<
  V7ToolResult<{
    handle: string
    relation: string
    items: unknown[]
    truncated: boolean
    related_handle?: {
      handle: string
      count: number
      description: string
      resource_type: string
    }
  }>
> {
  const idErr = rejectIdentityInjection(args as Record<string, unknown>)
  if (idErr) return idErr
  if (!args.handle) return toolErr('VALIDATION_ERROR', 'handle_required')

  const got = ctx.store.get(args.handle, ctx.binding)
  if (!got.ok) return toolErr(got.code, got.code.toLowerCase())
  if (got.record.count === 0) {
    return toolErr('ORDINAL_OUT_OF_RANGE', 'empty_set')
  }

  let ordinal = args.ordinal
  if (ordinal == null) {
    if (got.record.count !== 1) {
      return toolErr('VALIDATION_ERROR', 'ordinal_required_for_multi')
    }
    ordinal = 1
  }
  if (
    !Number.isInteger(ordinal) ||
    ordinal < 1 ||
    ordinal > got.record.count
  ) {
    return toolErr('ORDINAL_OUT_OF_RANGE', 'ordinal_out_of_range')
  }

  const rel = resolveRelationKey(args.relation)
  if (!rel.ok) return rel

  const memberId = got.record.memberIds[ordinal - 1]!

  if (got.record.resourceType === 'session') {
    if (rel.key !== 'LINKED_WEDDING') {
      return toolErr('UNSUPPORTED_RELATION', 'relation_not_allowed_for_session')
    }
    const sctx = new SessionReadContext(
      memberId,
      ctx.deps?.sessionContextOptions,
    )
    const itemsRaw = await linkedWeddingRelatedItems(sctx)
    const items = itemsRaw.map((item) => scrubIds(item))
    const wedding = await sctx.getLinkedWedding()
    const relatedIds = wedding ? [wedding.id] : []
    const relatedRecord = ctx.store.create({
      resourceType: 'wedding',
      memberIds: relatedIds,
      description:
        relatedIds.length === 0
          ? 'Pusty zestaw wesel (powiązane z sesją)'
          : 'Zestaw 1 wesela (powiązane z sesją)',
    })
    return {
      ok: true,
      handle: got.record.handle,
      relation: rel.key,
      items,
      truncated: false,
      related_handle: publicHandleView(relatedRecord),
    }
  }

  if (rel.key === 'LINKED_WEDDING') {
    return toolErr('UNSUPPORTED_RELATION', 'relation_not_allowed_for_wedding')
  }

  const context = new WeddingReadContext(memberId, ctx.deps?.contextOptions)
  const result = await listRelation(
    context,
    rel.key,
    V6_LIST_RELATED_HARD_CAP,
  )

  const items = result.items.map((item) => scrubIds(item))

  let related_handle:
    | {
        handle: string
        count: number
        description: string
        resource_type: string
      }
    | undefined

  if (rel.key === 'SESSIONS') {
    const sessions = await context.getSessions()
    const relatedRecord = ctx.store.create({
      resourceType: 'session',
      memberIds: sessions.map((s) => s.id),
      description:
        sessions.length === 0
          ? 'Pusty zestaw sesji (powiązane z weselem)'
          : `Zestaw ${sessions.length} sesji (powiązane z weselem)`,
    })
    related_handle = publicHandleView(relatedRecord)
  }

  return {
    ok: true,
    handle: got.record.handle,
    relation: rel.key,
    items,
    truncated: result.truncated,
    ...(related_handle ? { related_handle } : {}),
  }
}

export async function describeResourceSet(
  ctx: V7ToolContext,
  args: V7DescribeSetArgs,
): Promise<
  V7ToolResult<{
    handle: string
    count: number
    description: string
    preview: Array<{
      ordinal: number
      display_name: string | null
      date: string | null
    }>
  }>
> {
  const idErr = rejectIdentityInjection(args as Record<string, unknown>)
  if (idErr) return idErr
  if (!args.handle) return toolErr('VALIDATION_ERROR', 'handle_required')
  const limitErr = validateLimit(args.limit, DESCRIBE_PREVIEW_CAP)
  if (limitErr) return limitErr

  const got = ctx.store.get(args.handle, ctx.binding)
  if (!got.ok) return toolErr(got.code, got.code.toLowerCase())

  const limit = Math.min(args.limit ?? DESCRIBE_PREVIEW_CAP, DESCRIBE_PREVIEW_CAP)
  const universe =
    got.record.resourceType === 'session'
      ? await loadSessionUniverse(ctx.deps)
      : await loadWeddingUniverse(ctx.deps)
  const map = new Map(universe.map((r) => [r.id, r]))
  const preview = got.record.memberIds.slice(0, limit).map((id, i) => {
    const row = map.get(id)
    return {
      ordinal: i + 1,
      display_name: row?.displayLabel ?? null,
      date: row?.date ?? null,
    }
  })

  return {
    ok: true,
    handle: got.record.handle,
    count: got.record.count,
    description: got.record.description,
    preview,
  }
}

/**
 * Phase 2I.1 — nearest mixed assignments with limit AFTER global merge.
 * Returns ordered selected members without UUIDs; projection resolves IDs
 * via wedding_handle / session_handle membership + set_ordinal.
 */
export async function selectNearestAssignments(
  ctx: V7ToolContext,
  args: V7SelectNearestAssignmentsArgs,
): Promise<
  V7ToolResult<{
    count: number
    limit: number
    date_start: string | null
    date_end: string | null
    selected: Array<{
      ordinal: number
      resource_type: 'wedding' | 'session'
      display_name: string | null
      date: string
      /** 1-based ordinal within the typed result handle. */
      set_ordinal: number
    }>
    wedding_handle: string | null
    session_handle: string | null
  }>
> {
  const idErr = rejectIdentityInjection(args as Record<string, unknown>)
  if (idErr) return idErr
  if (ctx.store.isClosed) return toolErr('SESSION_CLOSED', 'session_closed')

  const limitErr = validateLimit(args.limit, DESCRIBE_PREVIEW_CAP)
  if (limitErr) return limitErr
  if (args.limit == null) {
    return toolErr('VALIDATION_ERROR', 'limit_required')
  }

  const dateStart =
    typeof args.date_start === 'string' && args.date_start
      ? args.date_start
      : ctx.deps?.todayKey ?? null
  const dateEnd =
    typeof args.date_end === 'string' && args.date_end ? args.date_end : undefined
  if (dateStart || dateEnd) {
    const dateErr = validateDateBounds(dateStart ?? undefined, dateEnd)
    if (dateErr) return dateErr
  }

  const includeWeddings = args.include_weddings !== false
  const includeSessions = args.include_sessions !== false
  if (!includeWeddings && !includeSessions) {
    return toolErr('VALIDATION_ERROR', 'domains_required')
  }

  const candidates: CombinedAssignmentCandidate[] = []

  if (includeWeddings) {
    const universe = await loadWeddingUniverse(ctx.deps)
    const byId = new Map(universe.map((r) => [r.id, r]))
    let ids: string[]
    if (typeof args.wedding_handle === 'string' && args.wedding_handle) {
      const got = ctx.store.get(args.wedding_handle, ctx.binding)
      if (!got.ok) return toolErr(got.code, got.code.toLowerCase())
      if (got.record.resourceType !== 'wedding') {
        return toolErr('VALIDATION_ERROR', 'wedding_handle_type_mismatch')
      }
      ids = [...got.record.memberIds]
    } else {
      ids = filterByDateBounds(
        universe,
        dateStart ?? undefined,
        dateEnd,
      ).map((r) => r.id)
    }
    for (const id of ids) {
      const row = byId.get(id)
      const date = row?.date
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      if (dateStart && date < dateStart) continue
      if (dateEnd && date > dateEnd) continue
      candidates.push({
        kind: 'wedding',
        entityId: id,
        date,
        displayName: row?.displayLabel ?? null,
      })
    }
  }

  if (includeSessions) {
    const universe = await loadSessionUniverse(ctx.deps)
    const byId = new Map(universe.map((r) => [r.id, r]))
    let ids: string[]
    if (typeof args.session_handle === 'string' && args.session_handle) {
      const got = ctx.store.get(args.session_handle, ctx.binding)
      if (!got.ok) return toolErr(got.code, got.code.toLowerCase())
      if (got.record.resourceType !== 'session') {
        return toolErr('VALIDATION_ERROR', 'session_handle_type_mismatch')
      }
      ids = [...got.record.memberIds]
    } else {
      ids = filterByDateBounds(
        universe,
        dateStart ?? undefined,
        dateEnd,
      ).map((r) => r.id)
    }
    for (const id of ids) {
      const row = byId.get(id)
      const date = row?.date
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      if (dateStart && date < dateStart) continue
      if (dateEnd && date > dateEnd) continue
      candidates.push({
        kind: 'session',
        entityId: id,
        date,
        displayName: row?.displayLabel ?? null,
      })
    }
  }

  const selected = selectCombinedAssignments(candidates, args.limit)
  const weddingIds = selected
    .filter((s) => s.kind === 'wedding')
    .map((s) => s.entityId)
  const sessionIds = selected
    .filter((s) => s.kind === 'session')
    .map((s) => s.entityId)

  const weddingRecord =
    weddingIds.length > 0
      ? ctx.store.create({
          resourceType: 'wedding',
          memberIds: weddingIds,
          description: `Wybrane zlecenia: ${weddingIds.length} wesel (top ${args.limit} mixed)`,
        })
      : null
  const sessionRecord =
    sessionIds.length > 0
      ? ctx.store.create({
          resourceType: 'session',
          memberIds: sessionIds,
          description: `Wybrane zlecenia: ${sessionIds.length} sesji (top ${args.limit} mixed)`,
        })
      : null

  const weddingOrd = new Map(weddingIds.map((id, i) => [id, i + 1]))
  const sessionOrd = new Map(sessionIds.map((id, i) => [id, i + 1]))

  return {
    ok: true,
    count: selected.length,
    limit: args.limit,
    date_start: dateStart,
    date_end: dateEnd ?? null,
    selected: selected.map((s, i) => ({
      ordinal: i + 1,
      resource_type: s.kind,
      display_name: s.displayName,
      date: s.date,
      set_ordinal:
        s.kind === 'wedding'
          ? (weddingOrd.get(s.entityId) ?? i + 1)
          : (sessionOrd.get(s.entityId) ?? i + 1),
    })),
    wedding_handle: weddingRecord?.handle ?? null,
    session_handle: sessionRecord?.handle ?? null,
  }
}

export const V7_TOOL_NAMES = [
  'report_turn_scope',
  'search_resources',
  'refine_resources',
  'sort_resources',
  'aggregate_resources',
  'inspect_resource',
  'list_related',
  'describe_resource_set',
  'select_nearest_assignments',
  'search_product_knowledge',
] as const

function searchProductKnowledgeTool(
  args: V7SearchProductKnowledgeArgs,
): V7ToolResult<Record<string, unknown>> {
  const query = typeof args.query === 'string' ? args.query : undefined
  const capabilityId =
    typeof args.capability_id === 'string' ? args.capability_id : undefined
  const terms = Array.isArray(args.terms)
    ? args.terms.filter((t): t is string => typeof t === 'string')
    : undefined
  const limit =
    typeof args.limit === 'number' && Number.isFinite(args.limit)
      ? args.limit
      : undefined

  if (!query && !capabilityId && (!terms || terms.length === 0)) {
    return toolErr('VALIDATION_ERROR', 'knowledge_query_required')
  }

  const { results } = searchProductKnowledge({
    query,
    terms,
    capability_id: capabilityId,
    limit,
  })

  return {
    ok: true,
    results,
  }
}

export type V7ToolName = (typeof V7_TOOL_NAMES)[number]

function reportTurnScopeTool(
  rawArgs: unknown,
): V7ToolResult<Record<string, unknown>> {
  const disposition = parseV7TurnDisposition(rawArgs)
  if (!disposition) {
    return toolErr('VALIDATION_ERROR', 'invalid_turn_disposition')
  }
  return {
    ok: true,
    domain: disposition,
    blocked: isV7BlockedDisposition(disposition),
  }
}

export async function executeV7Tool(
  ctx: V7ToolContext,
  name: string,
  rawArgs: unknown,
): Promise<V7ToolResult<Record<string, unknown>>> {
  if (ctx.store.isClosed) return toolErr('SESSION_CLOSED', 'session_closed')
  const args =
    rawArgs && typeof rawArgs === 'object'
      ? (rawArgs as Record<string, unknown>)
      : {}

  if (name === V7_REPORT_TURN_SCOPE_TOOL) {
    return reportTurnScopeTool(rawArgs)
  }

  if (!(V7_TOOL_NAMES as readonly string[]).includes(name)) {
    return toolErr('VALIDATION_ERROR', 'unknown_tool')
  }

  if (ctx.blockBusinessTools) {
    return toolErr('OPERATION_NOT_ALLOWED', 'turn_scope_blocked')
  }

  switch (name as V7ToolName) {
    case 'search_resources':
      return searchResources(ctx, args as V7SearchArgs)
    case 'refine_resources':
      return refineResources(ctx, args as unknown as V7RefineArgs)
    case 'sort_resources':
      return sortResources(ctx, args as unknown as V7SortArgs)
    case 'aggregate_resources':
      return aggregateResources(ctx, args as unknown as V7AggregateArgs)
    case 'inspect_resource':
      return inspectResource(ctx, args as unknown as V7InspectArgs)
    case 'list_related':
      return listRelatedResources(ctx, args as unknown as V7ListRelatedArgs)
    case 'describe_resource_set':
      return describeResourceSet(ctx, args as unknown as V7DescribeSetArgs)
    case 'select_nearest_assignments':
      return selectNearestAssignments(
        ctx,
        args as unknown as V7SelectNearestAssignmentsArgs,
      )
    case 'search_product_knowledge':
      return searchProductKnowledgeTool(
        args as unknown as V7SearchProductKnowledgeArgs,
      )
    default:
      return toolErr('VALIDATION_ERROR', 'unknown_tool')
  }
}
