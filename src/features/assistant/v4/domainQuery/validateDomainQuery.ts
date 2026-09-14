/**
 * G0 — fail-closed DomainQuery validation.
 * Rejects unknown fields, bad ops, SQL/identity keys, oversized limits.
 */

import {
  DOMAIN_QUERY_LIST_LIMIT,
  DOMAIN_QUERY_VERSION,
  type DomainDateBinding,
  type DomainFilter,
  type DomainQuery,
  type DomainRelationFilter,
} from './domainQuery'
import {
  getSemanticField,
  isSemanticFieldId,
  type AggregateOperator,
  type FilterOperator,
  type PlaceRoleValue,
  type SemanticFieldId,
} from './fieldRegistry'

export type DomainQueryValidation =
  | { ok: true; query: DomainQuery }
  | { ok: false; reason: string }

const FORBIDDEN_KEY =
  /^(userId|ownerId|tenantId|user_id|owner_id|tenant_id|studioId|studio_id)$/i

const FORBIDDEN_TOP =
  /^(sql|table|column|rpc|select|join|weddingIds|wedding_ids)$/i

const PLACE_ROLES = new Set<PlaceRoleValue>([
  'preparations',
  'ceremony',
  'reception',
  'any',
])

const G0_AGGREGATES = new Set<AggregateOperator>(['count', 'sum'])

function hasForbiddenKeys(value: unknown, depth = 0): boolean {
  if (depth > 8 || !value || typeof value !== 'object') return false
  if (Array.isArray(value)) {
    return value.some((v) => hasForbiddenKeys(v, depth + 1))
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(k)) return true
    if (depth === 0 && FORBIDDEN_TOP.test(k)) return true
    if (hasForbiddenKeys(v, depth + 1)) return true
  }
  return false
}

function isLocalDateKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function isDateRange(v: unknown): v is { from: string; to: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const r = v as Record<string, unknown>
  return (
    isLocalDateKey(r.from) &&
    isLocalDateKey(r.to) &&
    (r.from as string) <= (r.to as string)
  )
}

function validateFilter(f: unknown): DomainFilter | null {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null
  if (hasForbiddenKeys(f)) return null
  const row = f as Record<string, unknown>
  if (!isSemanticFieldId(row.field)) return null
  const def = getSemanticField(row.field)!
  const op = row.op
  if (typeof op !== 'string' || !def.filterOperators.includes(op as FilterOperator)) {
    return null
  }
  const value = row.value
  if (op === 'in_range') {
    if (!isDateRange(value) || def.valueType !== 'local_date') return null
  } else if (op === 'in') {
    if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) {
      return null
    }
  } else if (def.valueType === 'money') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
  } else if (def.valueType === 'local_date') {
    if (!isLocalDateKey(value)) return null
  } else if (def.id === 'place.role') {
    if (typeof value !== 'string' || !PLACE_ROLES.has(value as PlaceRoleValue)) {
      return null
    }
  } else if (typeof value !== 'string') {
    return null
  } else if (value.trim().length < 1 || value.length > 120) {
    return null
  }

  return {
    field: row.field as SemanticFieldId,
    op: op as FilterOperator,
    value: value as DomainFilter['value'],
  }
}

function validateRelation(r: unknown): DomainRelationFilter | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null
  if (hasForbiddenKeys(r)) return null
  const row = r as Record<string, unknown>
  if (row.relation !== 'place') return null
  if (row.field !== 'place.name' && row.field !== 'place.role') return null
  const def = getSemanticField(row.field)!
  const op = row.op
  if (typeof op !== 'string' || !def.filterOperators.includes(op as FilterOperator)) {
    return null
  }
  const value = row.value
  if (row.field === 'place.role') {
    if (typeof value !== 'string' || !PLACE_ROLES.has(value as PlaceRoleValue)) {
      return null
    }
  } else if (typeof value !== 'string') {
    return null
  } else if (value.trim().length < 2 || value.length > 120) {
    return null
  }
  return {
    relation: 'place',
    field: row.field,
    op: op as FilterOperator,
    value: value as DomainRelationFilter['value'],
  }
}

function validateDateBinding(raw: unknown): DomainDateBinding | null {
  if (raw == null) return null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (hasForbiddenKeys(raw)) return null
  const row = raw as Record<string, unknown>
  if (row.dimension !== 'wedding.date') return null
  if (!isDateRange(row.range)) return null
  return { dimension: 'wedding.date', range: row.range }
}

/**
 * Validate and normalize a DomainQuery assembled by application / shadow tests.
 */
export function validateDomainQuery(raw: unknown): DomainQueryValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid_shape' }
  }
  if (hasForbiddenKeys(raw)) {
    return { ok: false, reason: 'forbidden_identity_or_sql_keys' }
  }
  const row = raw as Record<string, unknown>
  if (row.version !== DOMAIN_QUERY_VERSION) {
    return { ok: false, reason: 'invalid_version' }
  }
  if (row.source !== 'wedding') {
    return { ok: false, reason: 'unsupported_source' }
  }

  const aggregate = row.aggregate
  if (
    aggregate != null &&
    (typeof aggregate !== 'string' || !G0_AGGREGATES.has(aggregate as AggregateOperator))
  ) {
    return { ok: false, reason: 'unsupported_aggregate' }
  }

  const measureRaw = row.measure
  let measure: SemanticFieldId | null = null
  if (measureRaw != null) {
    if (!isSemanticFieldId(measureRaw)) {
      return { ok: false, reason: 'unknown_measure' }
    }
    measure = measureRaw
    const def = getSemanticField(measure)!
    const agg = (aggregate ?? 'sum') as AggregateOperator
    if (agg === 'sum' && !def.aggregateOperators.includes('sum')) {
      return { ok: false, reason: 'measure_not_summable' }
    }
    if (agg === 'count' && measure) {
      // count ignores measure; allow null preferred
    }
  }

  if (aggregate === 'sum' && !measure) {
    return { ok: false, reason: 'measure_required_for_sum' }
  }
  if (aggregate === 'sum' && measure) {
    const def = getSemanticField(measure)!
    if (def.valueType !== 'money') {
      return { ok: false, reason: 'sum_requires_money_measure' }
    }
  }

  if (!Array.isArray(row.filters)) {
    return { ok: false, reason: 'invalid_filters' }
  }
  const filters: DomainFilter[] = []
  for (const f of row.filters) {
    const parsed = validateFilter(f)
    if (!parsed) return { ok: false, reason: 'invalid_filter' }
    filters.push(parsed)
  }

  if (!Array.isArray(row.relations)) {
    return { ok: false, reason: 'invalid_relations' }
  }
  const relations: DomainRelationFilter[] = []
  for (const r of row.relations) {
    const parsed = validateRelation(r)
    if (!parsed) return { ok: false, reason: 'invalid_relation' }
    relations.push(parsed)
  }

  const dateBinding = validateDateBinding(row.dateBinding ?? null)
  if (row.dateBinding != null && dateBinding == null) {
    return { ok: false, reason: 'invalid_date_binding' }
  }

  let limit: number | null = null
  if (row.limit != null) {
    if (typeof row.limit !== 'number' || !Number.isFinite(row.limit) || row.limit < 1) {
      return { ok: false, reason: 'invalid_limit' }
    }
    limit = Math.min(Math.floor(row.limit), DOMAIN_QUERY_LIST_LIMIT)
  }

  const orderBy: DomainQuery['orderBy'] = []
  if (row.orderBy != null) {
    if (!Array.isArray(row.orderBy)) {
      return { ok: false, reason: 'invalid_order_by' }
    }
    for (const o of row.orderBy) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) {
        return { ok: false, reason: 'invalid_order_by' }
      }
      const ob = o as Record<string, unknown>
      if (!isSemanticFieldId(ob.field)) {
        return { ok: false, reason: 'unknown_order_field' }
      }
      const def = getSemanticField(ob.field)!
      if (!def.sortable) return { ok: false, reason: 'field_not_sortable' }
      if (ob.direction !== 'asc' && ob.direction !== 'desc') {
        return { ok: false, reason: 'invalid_order_direction' }
      }
      orderBy.push({ field: ob.field, direction: ob.direction })
    }
  }

  const agg = (aggregate as AggregateOperator | null) ?? 'count'

  // list = aggregate null + limit; G0 treats aggregate null as list when limit set
  // or explicit aggregate 'count'|'sum'. For list we use aggregate: null.
  const normalized: DomainQuery = {
    version: DOMAIN_QUERY_VERSION,
    source: 'wedding',
    filters,
    relations,
    measure: agg === 'sum' ? measure : measure,
    aggregate: row.aggregate === null ? null : agg,
    orderBy,
    limit:
      row.aggregate === null
        ? (limit ?? DOMAIN_QUERY_LIST_LIMIT)
        : limit,
    dateBinding,
  }

  // Reject sum of non-money already handled. Reject sum wedding.date:
  if (
    normalized.aggregate === 'sum' &&
    normalized.measure === 'wedding.date'
  ) {
    return { ok: false, reason: 'sum_requires_money_measure' }
  }

  return { ok: true, query: normalized }
}
