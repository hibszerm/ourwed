/**
 * Phase 3D/3E — canonical V4 CollectionQuery contract.
 * Closed enums only. No SQL, identity, table/column/RPC, or model predicates.
 *
 * Authority: TaskSpec → Resolver → CollectionQuery → collection.query
 * V2 AssistantQueryPlan is adapted at the boundary (not a parallel semantic authority).
 */

import {
  normalizeLocationQuery,
  type CollectionLocationRole,
} from './locationMatch'

export const COLLECTION_QUERY_LIST_LIMIT = 20
export const COLLECTION_QUERY_MEMBER_ID_CAP = 40

export type CollectionQueryResource = 'wedding'

export type CollectionQueryOperation = 'count' | 'sum' | 'rank' | 'list'

export type CollectionQueryMetric =
  | 'contract_value'
  | 'paid'
  | 'remaining'

export type CollectionDateRange = {
  from: string
  to: string
}

export type { CollectionLocationRole }

/** Normalized filters — filter definition is activeCollection source of truth. */
export type CollectionQueryFilters = {
  dateRange?: CollectionDateRange | null
  /** Venue / locality text filter (authoritative place SoT matching). */
  locationQuery?: string | null
  /** Restrict matching to a place-role family; default any. */
  locationRole?: CollectionLocationRole | null
}

export type CollectionQueryRank = {
  direction: 'asc' | 'desc'
  limit: number
}

/**
 * Canonical bounded plan owned by application code.
 * Built from ResolvedTask — never from raw model JSON or SQL.
 */
export type CollectionQuery = {
  resource: CollectionQueryResource
  operation: CollectionQueryOperation
  filters: CollectionQueryFilters
  metric?: CollectionQueryMetric | null
  rank?: CollectionQueryRank | null
  limit?: number | null
  /** True when filters were inherited from activeCollection. */
  usedActiveCollection: boolean
}

export type CollectionQueryValidation =
  | { ok: true; query: CollectionQuery }
  | { ok: false; reason: string }

const FORBIDDEN_KEY =
  /^(userId|ownerId|tenantId|user_id|owner_id|tenant_id|studioId|studio_id)$/i

function hasForbiddenKeys(value: unknown, depth = 0): boolean {
  if (depth > 6 || !value || typeof value !== 'object') return false
  if (Array.isArray(value)) {
    return value.some((v) => hasForbiddenKeys(v, depth + 1))
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(k)) return true
    // SQL-shaped keys only at top-level plan (dateRange uses from/to).
    if (
      depth === 0 &&
      /^(sql|table|column|rpc|select|join|weddingIds|wedding_ids)$/i.test(k)
    ) {
      return true
    }
    if (hasForbiddenKeys(v, depth + 1)) return true
  }
  return false
}

function parseLocationRole(raw: unknown): CollectionLocationRole | null {
  if (raw == null || raw === '') return null
  if (
    raw === 'preparations' ||
    raw === 'ceremony' ||
    raw === 'reception' ||
    raw === 'any'
  ) {
    return raw
  }
  return null
}

/**
 * Validate a CollectionQuery assembled by application code.
 * Rejects identity / SQL-shaped keys and out-of-enum values.
 */
export function validateCollectionQuery(
  raw: unknown,
): CollectionQueryValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_shape' }
  }
  if (hasForbiddenKeys(raw)) {
    return { ok: false, reason: 'forbidden_identity_or_sql_keys' }
  }
  const row = raw as Record<string, unknown>
  if (row.resource !== 'wedding') {
    return { ok: false, reason: 'resource_not_wedding' }
  }
  const op = row.operation
  if (op !== 'count' && op !== 'sum' && op !== 'rank' && op !== 'list') {
    return { ok: false, reason: 'invalid_operation' }
  }
  if (
    row.metric != null &&
    row.metric !== 'contract_value' &&
    row.metric !== 'paid' &&
    row.metric !== 'remaining'
  ) {
    return { ok: false, reason: 'invalid_metric' }
  }
  if ((op === 'sum' || op === 'rank') && !row.metric) {
    return { ok: false, reason: 'metric_required' }
  }

  const filtersRaw = row.filters
  if (!filtersRaw || typeof filtersRaw !== 'object' || Array.isArray(filtersRaw)) {
    return { ok: false, reason: 'invalid_filters' }
  }
  if (hasForbiddenKeys(filtersRaw)) {
    return { ok: false, reason: 'forbidden_filter_keys' }
  }
  const filters = filtersRaw as Record<string, unknown>
  if (hasForbiddenKeys(filters.location ?? filters)) {
    return { ok: false, reason: 'forbidden_location_keys' }
  }

  const dr = filters.dateRange as CollectionDateRange | null | undefined
  if (dr != null) {
    if (
      typeof dr !== 'object' ||
      typeof dr.from !== 'string' ||
      typeof dr.to !== 'string' ||
      dr.from > dr.to
    ) {
      return { ok: false, reason: 'invalid_date_range' }
    }
  }

  const locationQuery = normalizeLocationQuery(
    typeof filters.locationQuery === 'string' ? filters.locationQuery : null,
  )
  const locationRole = parseLocationRole(filters.locationRole)
  if (filters.locationRole != null && locationRole == null) {
    return { ok: false, reason: 'invalid_location_role' }
  }

  let limit: number | null = null
  if (row.limit != null) {
    if (typeof row.limit !== 'number' || !Number.isFinite(row.limit) || row.limit < 1) {
      return { ok: false, reason: 'invalid_limit' }
    }
    limit = Math.min(Math.floor(row.limit), COLLECTION_QUERY_LIST_LIMIT)
  }

  let rank: CollectionQueryRank | null = null
  if (op === 'rank') {
    const r = row.rank as CollectionQueryRank | null | undefined
    const direction = r?.direction === 'asc' ? 'asc' : 'desc'
    const rankLimit = Math.min(
      Math.max(1, Math.floor(r?.limit ?? 1)),
      COLLECTION_QUERY_LIST_LIMIT,
    )
    rank = { direction, limit: rankLimit }
  }

  const query: CollectionQuery = {
    resource: 'wedding',
    operation: op,
    filters: {
      dateRange: (dr as CollectionDateRange | null | undefined) ?? null,
      locationQuery,
      locationRole: locationRole ?? (locationQuery ? 'any' : null),
    },
    metric: (row.metric as CollectionQueryMetric | null | undefined) ?? null,
    rank,
    limit: op === 'list' ? (limit ?? COLLECTION_QUERY_LIST_LIMIT) : limit,
    usedActiveCollection: Boolean(row.usedActiveCollection),
  }
  return { ok: true, query }
}
