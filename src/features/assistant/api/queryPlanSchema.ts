/**
 * Runtime validation for Assistant V2 QueryPlan.
 * Enums only — reject identity, SQL, unknown fields.
 */

import type {
  AssistantCollectionFilters,
  AssistantCollectionResource,
  AssistantMoneyField,
  AssistantPaymentState,
  AssistantRemainingComparator,
  AssistantSortField,
} from './workingContext'

const RESOURCES = new Set(['weddings', 'sessions', 'assignments'])
const OPERATIONS = new Set(['count', 'sum', 'min', 'max', 'list'])
const FIELDS = new Set([
  'contractValue',
  'paidAmount',
  'remainingAmount',
  'date',
])
const MONEY_FIELDS = new Set([
  'contractValue',
  'paidAmount',
  'remainingAmount',
])
const PAYMENT_STATES = new Set([
  'unpaid',
  'partial',
  'paid',
  'deposit_missing',
])
const TARGETS = new Set([
  'active_collection',
  'active_resource',
  'explicit',
])
const COMPARE_OPS = new Set(['gt', 'gte', 'lt', 'lte'])

export const ASSISTANT_QUERY_LIST_LIMIT = 20
export const ASSISTANT_MEMBER_ID_CAP = 40

export type AssistantQueryPlan = {
  kind: 'query_plan'
  resource: AssistantCollectionResource
  operation: 'count' | 'sum' | 'min' | 'max' | 'list'
  field?: AssistantSortField | null
  filters?: {
    dateRange?:
      | { from: string; to: string }
      | { phrase: string }
    useActiveCollection?: boolean
    personQuery?: string | null
    locationQuery?: string | null
    packageQuery?: string | null
    workflowStage?: string | null
    paymentState?: AssistantPaymentState | null
    remainingAmount?: AssistantRemainingComparator | null
  }
  sort?: {
    field: AssistantSortField
    direction: 'asc' | 'desc'
  } | null
  limit?: number
  target?: 'active_collection' | 'active_resource' | 'explicit' | null
}

const FORBIDDEN_KEY =
  /^(userId|ownerId|tenantId|user_id|owner_id|tenant_id)$/i

function hasForbiddenKeys(value: unknown, depth = 0): boolean {
  if (depth > 8 || !value || typeof value !== 'object') return false
  if (Array.isArray(value)) {
    return value.some((v) => hasForbiddenKeys(v, depth + 1))
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(k)) return true
    if (/sql|select\s|from\s|drop\s|insert\s|update\s|delete\s/i.test(k)) {
      return true
    }
    if (hasForbiddenKeys(v, depth + 1)) return true
  }
  return false
}

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

function parseDateRange(
  raw: unknown,
):
  | { from: string; to: string }
  | { phrase: string }
  | null
  | undefined {
  if (raw === undefined) return undefined
  if (raw === null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (hasForbiddenKeys(row)) return null
  const phrase = asString(row.phrase)
  if (phrase) return { phrase }
  const from = asString(row.from)
  const to = asString(row.to)
  if (from && to && from <= to) return { from, to }
  return null
}

function parseRemaining(
  raw: unknown,
): AssistantRemainingComparator | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (hasForbiddenKeys(row)) return null
  const operator = asString(row.operator)
  const value = row.value
  if (!operator || !COMPARE_OPS.has(operator)) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return {
    operator: operator as AssistantRemainingComparator['operator'],
    value,
  }
}

/**
 * Validate model/Edge QueryPlan. Returns null if unsafe or malformed.
 */
export function validateAssistantQueryPlan(
  raw: unknown,
): AssistantQueryPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (hasForbiddenKeys(raw)) return null
  const row = raw as Record<string, unknown>

  // Reject mutation-looking keys
  for (const k of Object.keys(row)) {
    if (/^(update|delete|insert|patch|write|sql|rpc|table|column)$/i.test(k)) {
      return null
    }
  }

  const resource = asString(row.resource)
  const operation = asString(row.operation)
  if (!resource || !RESOURCES.has(resource)) return null
  if (!operation || !OPERATIONS.has(operation)) return null

  let field: AssistantSortField | null | undefined
  if (row.field === null) field = null
  else if (row.field !== undefined) {
    const f = asString(row.field)
    if (!f || !FIELDS.has(f)) return null
    field = f as AssistantSortField
  }

  if (
    (operation === 'sum' || operation === 'min' || operation === 'max') &&
    (!field || field === 'date' && operation === 'sum')
  ) {
    if (operation === 'sum' && (!field || !MONEY_FIELDS.has(field))) return null
    if ((operation === 'min' || operation === 'max') && !field) return null
  }

  if (
    (field === 'paidAmount' || field === 'remainingAmount') &&
    resource === 'sessions' &&
    (operation === 'sum' || operation === 'min' || operation === 'max')
  ) {
    // Sessions support money via sessionListLight payments — OK
  }

  if (
    (field === 'paidAmount' ||
      field === 'remainingAmount' ||
      field === 'contractValue') &&
    resource === 'assignments' &&
    operation !== 'count' &&
    operation !== 'list'
  ) {
    // Assignment money aggregates: weddings use wedding CV/paid; sessions use totalPrice/paid
    // Allowed for sum/min/max
  }

  let filters: AssistantQueryPlan['filters'] | undefined
  if (row.filters != null) {
    if (typeof row.filters !== 'object' || Array.isArray(row.filters)) {
      return null
    }
    if (hasForbiddenKeys(row.filters)) return null
    const f = row.filters as Record<string, unknown>
    const dateRange = parseDateRange(f.dateRange)
    if (f.dateRange !== undefined && dateRange === null) return null

    const paymentStateRaw = f.paymentState
    let paymentState: AssistantPaymentState | null | undefined
    if (paymentStateRaw === null) paymentState = null
    else if (paymentStateRaw !== undefined) {
      const ps = asString(paymentStateRaw)
      if (!ps || !PAYMENT_STATES.has(ps)) return null
      paymentState = ps as AssistantPaymentState
    }

    const remainingAmount = parseRemaining(f.remainingAmount)
    if (f.remainingAmount !== undefined && remainingAmount === null) {
      return null
    }

    filters = {
      ...(dateRange ? { dateRange } : {}),
      useActiveCollection:
        typeof f.useActiveCollection === 'boolean'
          ? f.useActiveCollection
          : undefined,
      personQuery:
        f.personQuery === null
          ? null
          : f.personQuery !== undefined
            ? asString(f.personQuery)
            : undefined,
      locationQuery:
        f.locationQuery === null
          ? null
          : f.locationQuery !== undefined
            ? asString(f.locationQuery)
            : undefined,
      packageQuery:
        f.packageQuery === null
          ? null
          : f.packageQuery !== undefined
            ? asString(f.packageQuery)
            : undefined,
      workflowStage:
        f.workflowStage === null
          ? null
          : f.workflowStage !== undefined
            ? asString(f.workflowStage)
            : undefined,
      ...(paymentState !== undefined ? { paymentState } : {}),
      ...(remainingAmount !== undefined ? { remainingAmount } : {}),
    }
  }

  let sort: AssistantQueryPlan['sort'] = undefined
  if (row.sort === null) sort = null
  else if (row.sort !== undefined) {
    if (typeof row.sort !== 'object' || Array.isArray(row.sort)) return null
    if (hasForbiddenKeys(row.sort)) return null
    const s = row.sort as Record<string, unknown>
    const sf = asString(s.field)
    const dir = asString(s.direction) ?? 'desc'
    if (!sf || !FIELDS.has(sf)) return null
    if (dir !== 'asc' && dir !== 'desc') return null
    sort = { field: sf as AssistantSortField, direction: dir }
  }

  let limit: number | undefined
  if (row.limit !== undefined && row.limit !== null) {
    if (typeof row.limit !== 'number' || !Number.isFinite(row.limit)) return null
    limit = Math.min(
      ASSISTANT_QUERY_LIST_LIMIT,
      Math.max(1, Math.floor(row.limit)),
    )
  }

  let target: AssistantQueryPlan['target'] = undefined
  if (row.target === null) target = null
  else if (row.target !== undefined) {
    const t = asString(row.target)
    if (!t || !TARGETS.has(t)) return null
    target = t as NonNullable<AssistantQueryPlan['target']>
  }

  return {
    kind: 'query_plan',
    resource: resource as AssistantCollectionResource,
    operation: operation as AssistantQueryPlan['operation'],
    field,
    filters,
    sort,
    limit,
    target,
  }
}

export function filtersFromPlan(
  plan: AssistantQueryPlan,
  resolvedDateRange: { from: string; to: string } | null,
): AssistantCollectionFilters {
  const f = plan.filters
  return {
    ...(resolvedDateRange ? { dateRange: resolvedDateRange } : {}),
    personQuery: f?.personQuery ?? null,
    locationQuery: f?.locationQuery ?? null,
    packageQuery: f?.packageQuery ?? null,
    workflowStage: f?.workflowStage ?? null,
    paymentState: f?.paymentState ?? null,
    remainingAmount: f?.remainingAmount ?? null,
    status: 'active_archived',
  }
}

export type { AssistantMoneyField }
