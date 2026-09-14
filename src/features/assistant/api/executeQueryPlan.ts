/**
 * Assistant V2 QueryPlan executor — READ ONLY.
 * Uses weddingListLight / sessionListLight with batched payments.
 * Never N× weddingService.getById for collection money ops.
 */

import { matchesModernWeddingSearch } from '@/features/weddings/modern/modernWeddingsModel'
import { matchesModernSessionSearch } from '@/features/sessions/modern/modernSessionsModel'
import { getWeddingDisplayName } from '@/features/weddings/presentation/getWeddingDisplayName'
import { getSessionDisplayName } from '@/features/sessions/presentation/getSessionDisplayName'
import { sessionListLightService } from '@/lib/api/sessionListLightService'
import { weddingListLightService } from '@/lib/api/weddingListLightService'
import {
  resolveFinancePaymentStatus,
} from '@/lib/finance/financeSeasonAggregate'
import { getAgreedDeposit, getContractValue } from '@/lib/utils/commercial'
import {
  getRemainingToPay,
  getTotalPaid,
} from '@/lib/utils/finance'
import { toLocalCalendarDateKey } from '@/lib/utils/localCalendarDate'
import type { Session } from '@/types/session'
import type { Wedding } from '@/types/wedding'
import { ASSISTANT_UNRECOGNIZED } from '../copy'
import {
  formatPolishLongDate,
  resolveAggregateDateRange,
} from '../dates'
import { polishCountUnit } from '../tools/aggregateRange'
import { toSessionCard, toWeddingCard } from '../tools/dto'
import { normalizeLocationText } from '../v4/capabilities/collection/locationMatch'
import type { AssistantResponse } from '../types'
import {
  ASSISTANT_MEMBER_ID_CAP,
  ASSISTANT_QUERY_LIST_LIMIT,
  filtersFromPlan,
  type AssistantQueryPlan,
  validateAssistantQueryPlan,
} from './queryPlanSchema'
import type {
  AssistantCollectionFilters,
  AssistantSortField,
  AssistantWorkingContext,
  WorkingContextPatch,
} from './workingContext'
import { participantsFromWedding } from './participants'
import { FINANCE_INCLUDED_STATUSES } from '@/lib/finance/financeSeasonAggregate'

export type QueryPlanExecution = {
  response: AssistantResponse
  contextPatch: WorkingContextPatch
}

type MoneyBag = {
  id: string
  kind: 'wedding' | 'session'
  displayLabel: string
  date: string | null
  contractValue: number
  paidAmount: number
  remainingAmount: number
  depositMissing: boolean
  paymentState: 'unpaid' | 'partial' | 'paid' | 'value_unset'
  locationLine: string | null
  packageName: string | null
  workflowStage: string | null
  wedding?: Wedding
  session?: Session
}

function isIncludedWedding(w: Wedding): boolean {
  return (FINANCE_INCLUDED_STATUSES as readonly string[]).includes(w.status)
}

function inDateRange(
  date: string | null | undefined,
  range: { from: string; to: string } | undefined,
): boolean {
  if (!range) return true
  const key = toLocalCalendarDateKey(date)
  if (!key) return false
  return key >= range.from && key <= range.to
}

function weddingLocationLine(w: Wedding): string | null {
  return toWeddingCard(w).locationLine
}

function weddingToRow(w: Wedding): MoneyBag {
  const contractValue = getContractValue(w)
  const paidAmount = getTotalPaid(w.payments ?? [])
  const remainingAmount = getRemainingToPay(contractValue, w.payments ?? [])
  const agreed = getAgreedDeposit(w)
  const paymentState = resolveFinancePaymentStatus(contractValue, paidAmount)
  return {
    id: w.id,
    kind: 'wedding',
    displayLabel: getWeddingDisplayName(w),
    date: toLocalCalendarDateKey(w.date),
    contractValue,
    paidAmount,
    remainingAmount,
    depositMissing: agreed > 0 && paidAmount < agreed,
    paymentState,
    locationLine: weddingLocationLine(w),
    packageName: w.packageName?.trim() || null,
    workflowStage: w.workflowStage ?? null,
    wedding: w,
  }
}

function sessionToRow(s: Session): MoneyBag {
  const contractValue = Number.isFinite(s.totalPrice)
    ? Math.max(0, s.totalPrice)
    : 0
  const paidAmount = getTotalPaid(s.payments ?? [])
  const remainingAmount = getRemainingToPay(contractValue, s.payments ?? [])
  const agreed = Number.isFinite(s.depositAmount)
    ? Math.max(0, s.depositAmount ?? 0)
    : 0
  const paymentState = resolveFinancePaymentStatus(contractValue, paidAmount)
  const card = toSessionCard(s)
  return {
    id: s.id,
    kind: 'session',
    displayLabel: getSessionDisplayName(s),
    date: toLocalCalendarDateKey(s.date),
    contractValue,
    paidAmount,
    remainingAmount,
    depositMissing: agreed > 0 && paidAmount < agreed,
    paymentState,
    locationLine: card.locationLine,
    packageName: null,
    workflowStage: null,
    session: s,
  }
}

function matchesFilters(row: MoneyBag, filters: AssistantCollectionFilters): boolean {
  if (!inDateRange(row.date, filters.dateRange)) return false

  if (filters.personQuery?.trim()) {
    if (row.kind === 'wedding' && row.wedding) {
      if (!matchesModernWeddingSearch(row.wedding, filters.personQuery)) {
        return false
      }
    } else if (row.kind === 'session' && row.session) {
      if (!matchesModernSessionSearch(row.session, filters.personQuery)) {
        return false
      }
    }
  }

  if (filters.locationQuery?.trim()) {
    // Phase 3E: share normalization with V4 (no QueryPlan redesign).
    const q = normalizeLocationText(filters.locationQuery)
    const hay = normalizeLocationText(row.locationLine)
    if (!q || !hay.includes(q)) return false
  }

  if (filters.packageQuery?.trim()) {
    const q = filters.packageQuery.trim().toLowerCase()
    if (!(row.packageName ?? '').toLowerCase().includes(q)) return false
  }

  if (filters.workflowStage?.trim()) {
    if (row.workflowStage !== filters.workflowStage.trim()) return false
  }

  if (filters.paymentState) {
    if (filters.paymentState === 'deposit_missing') {
      if (!row.depositMissing) return false
    } else if (row.paymentState !== filters.paymentState) {
      return false
    }
  }

  if (filters.remainingAmount) {
    const { operator, value } = filters.remainingAmount
    const rem = row.remainingAmount
    if (operator === 'gt' && !(rem > value)) return false
    if (operator === 'gte' && !(rem >= value)) return false
    if (operator === 'lt' && !(rem < value)) return false
    if (operator === 'lte' && !(rem <= value)) return false
  }

  return true
}

function fieldValue(row: MoneyBag, field: AssistantSortField): number {
  if (field === 'date') {
    const key = row.date
    if (!key) return Number.POSITIVE_INFINITY
    return Date.parse(`${key}T12:00:00`)
  }
  if (field === 'contractValue') return row.contractValue
  if (field === 'paidAmount') return row.paidAmount
  return row.remainingAmount
}

function resolveDateRangeFromPlan(
  plan: AssistantQueryPlan,
  active: AssistantWorkingContext,
): { from: string; to: string } | null {
  const useActive =
    plan.filters?.useActiveCollection === true ||
    plan.target === 'active_collection'
  const dr = plan.filters?.dateRange
  if (dr && 'from' in dr && 'to' in dr) return { from: dr.from, to: dr.to }
  if (dr && 'phrase' in dr) {
    const resolved = resolveAggregateDateRange(dr.phrase)
    if (resolved) return { from: resolved.from, to: resolved.to }
  }
  if (useActive && active.activeCollection?.filters.dateRange) {
    return active.activeCollection.filters.dateRange
  }
  return null
}

function mergeFilters(
  plan: AssistantQueryPlan,
  active: AssistantWorkingContext,
  resolvedRange: { from: string; to: string } | null,
): AssistantCollectionFilters {
  const useActive =
    plan.filters?.useActiveCollection === true ||
    plan.target === 'active_collection'

  const base: AssistantCollectionFilters =
    useActive && active.activeCollection
      ? { ...active.activeCollection.filters }
      : { status: 'active_archived' }

  const fromPlan = filtersFromPlan(plan, resolvedRange)
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(fromPlan).filter(([, v]) => v != null && v !== ''),
    ),
    dateRange: fromPlan.dateRange ?? base.dateRange,
    remainingAmount: fromPlan.remainingAmount ?? base.remainingAmount,
    paymentState: fromPlan.paymentState ?? base.paymentState,
  }
}

function collectionLabel(filters: AssistantCollectionFilters): string | undefined {
  const dr = filters.dateRange
  if (!dr) return undefined
  const yFrom = dr.from.slice(0, 4)
  const yTo = dr.to.slice(0, 4)
  if (
    yFrom === yTo &&
    dr.from.endsWith('-01-01') &&
    dr.to.endsWith('-12-31')
  ) {
    return yFrom
  }
  const months = [
    'styczeń',
    'luty',
    'marzec',
    'kwiecień',
    'maj',
    'czerwiec',
    'lipiec',
    'sierpień',
    'wrzesień',
    'październik',
    'listopad',
    'grudzień',
  ]
  const m = Number(dr.from.slice(5, 7))
  const phrase = `${months[m - 1] ?? ''} ${yFrom}`.trim()
  return resolveAggregateDateRange(phrase)?.titleLabel
}

function moneyLabel(field: AssistantSortField | null | undefined): string {
  if (field === 'paidAmount') return 'wpłacono łącznie'
  if (field === 'remainingAmount') return 'do zapłaty łącznie'
  return 'łączna wartość zleceń ślubnych'
}

async function loadRows(
  resource: AssistantQueryPlan['resource'],
): Promise<MoneyBag[]> {
  if (resource === 'weddings') {
    const weddings = await weddingListLightService.listWeddingsForList()
    return weddings.filter(isIncludedWedding).map(weddingToRow)
  }
  if (resource === 'sessions') {
    const sessions = await sessionListLightService.listSessionsForList()
    return sessions.map(sessionToRow)
  }
  const [weddings, sessions] = await Promise.all([
    weddingListLightService.listWeddingsForList(),
    sessionListLightService.listSessionsForList(),
  ])
  return [
    ...weddings.filter(isIncludedWedding).map(weddingToRow),
    ...sessions.map(sessionToRow),
  ]
}

function unitFor(
  resource: AssistantQueryPlan['resource'],
  count: number,
): string {
  return polishCountUnit(resource, count)
}

/**
 * Execute a validated QueryPlan. Never accepts unvalidated raw plans.
 */
export async function executeAssistantQueryPlan(input: {
  plan: AssistantQueryPlan
  workingContext: AssistantWorkingContext
}): Promise<QueryPlanExecution> {
  const plan = input.plan
  const active = input.workingContext

  const resolvedRange = resolveDateRangeFromPlan(plan, active)
  const filters = mergeFilters(plan, active, resolvedRange)

  // If useActiveCollection but no collection — fail clearly
  if (
    (plan.filters?.useActiveCollection || plan.target === 'active_collection') &&
    !active.activeCollection &&
    !resolvedRange &&
    !plan.filters?.personQuery
  ) {
    return {
      response: {
        kind: 'error',
        message:
          'Nie mam aktywnego zbioru zleceń. Najpierw zapytaj np. o wesela w danym miesiącu.',
      },
      contextPatch: {},
    }
  }

  const resource =
    plan.target === 'active_collection' && active.activeCollection
      ? active.activeCollection.resource
      : plan.resource

  const all = await loadRows(resource)
  let rows = all.filter((r) => matchesFilters(r, filters))

  // Optional: restrict to previous memberIds when refining ranking within same set
  if (
    plan.filters?.useActiveCollection &&
    active.activeCollection?.memberIds?.length &&
    (plan.operation === 'min' ||
      plan.operation === 'max' ||
      plan.operation === 'list')
  ) {
    const idSet = new Set(active.activeCollection.memberIds)
    const narrowed = rows.filter((r) => idSet.has(r.id))
    if (narrowed.length > 0) rows = narrowed
  }

  const label =
    collectionLabel(filters) ??
    active.activeCollection?.label ??
    undefined

  const rangeLabel = filters.dateRange
    ? `${formatPolishLongDate(filters.dateRange.from)} – ${formatPolishLongDate(filters.dateRange.to)}`
    : undefined

  const memberIds = rows
    .map((r) => r.id)
    .slice(0, ASSISTANT_MEMBER_ID_CAP)

  const collectionState = {
    resource,
    filters,
    memberIds,
    resultCount: rows.length,
    label,
  }

  if (plan.operation === 'count') {
    return {
      response: {
        kind: 'scalar',
        metric: 'count',
        value: rows.length,
        unitLabel: unitFor(resource, rows.length),
        titleLabel: label ?? 'Wynik',
        rangeLabel: rangeLabel ?? null,
        navigate: { path: '/kalendarz', label: 'Otwórz kalendarz' },
      },
      contextPatch: {
        activeCollection: collectionState,
        activeResource: null,
        lastOperation: {
          type: 'count',
          scalarValue: rows.length,
        },
        pendingClarification: null,
      },
    }
  }

  if (plan.operation === 'sum') {
    const field = (plan.field ?? 'contractValue') as AssistantSortField
    if (field === 'date') {
      return {
        response: { kind: 'error', message: ASSISTANT_UNRECOGNIZED },
        contextPatch: {},
      }
    }
    const value = rows.reduce((s, r) => s + fieldValue(r, field), 0)
    return {
      response: {
        kind: 'money',
        metric: 'sum',
        field,
        value,
        currency: 'PLN',
        titleLabel: label ?? 'Wynik',
        subtitle: moneyLabel(field),
        count: rows.length,
        unitLabel: unitFor(resource, rows.length),
        rangeLabel: rangeLabel ?? null,
        navigate:
          field === 'contractValue' || field === 'paidAmount' || field === 'remainingAmount'
            ? { path: '/finanse', label: 'Otwórz finanse' }
            : undefined,
      },
      contextPatch: {
        activeCollection: collectionState,
        lastOperation: { type: 'sum', field, scalarValue: value },
        pendingClarification: null,
      },
    }
  }

  if (plan.operation === 'min' || plan.operation === 'max') {
    const field = plan.field ?? 'contractValue'
    if (rows.length === 0) {
      return {
        response: {
          kind: 'scalar',
          metric: 'count',
          value: 0,
          unitLabel: unitFor(resource, 0),
          titleLabel: label ?? 'Wynik',
          rangeLabel: rangeLabel ?? null,
        },
        contextPatch: {
          activeCollection: collectionState,
          activeResource: null,
          lastOperation: { type: plan.operation, field },
          pendingClarification: null,
        },
      }
    }

    const sorted = [...rows].sort((a, b) => {
      const av = fieldValue(a, field)
      const bv = fieldValue(b, field)
      return plan.operation === 'max' ? bv - av : av - bv
    })
    const winner = sorted[0]!

    if (winner.kind === 'wedding' && winner.wedding) {
      return {
        response: {
          kind: 'wedding',
          wedding: toWeddingCard(winner.wedding),
          navigate: {
            path: `/sluby/${winner.id}`,
            label: 'Otwórz zlecenie',
          },
        },
        contextPatch: {
          activeCollection: collectionState,
          activeResource: {
            kind: 'wedding',
            id: winner.id,
            displayLabel: winner.displayLabel,
            participants: participantsFromWedding(winner.wedding),
          },
          activeParticipant: null,
          lastOperation: {
            type: plan.operation,
            field,
            scalarValue: fieldValue(winner, field),
          },
          pendingClarification: null,
        },
      }
    }

    if (winner.session) {
      return {
        response: {
          kind: 'session',
          session: toSessionCard(winner.session),
          navigate: {
            path: `/sesje/${winner.id}`,
            label: 'Otwórz sesję',
          },
        },
        contextPatch: {
          activeCollection: collectionState,
          activeResource: {
            kind: 'session',
            id: winner.id,
            displayLabel: winner.displayLabel,
          },
          lastOperation: {
            type: plan.operation,
            field,
            scalarValue: fieldValue(winner, field),
          },
          pendingClarification: null,
        },
      }
    }
  }

  // list
  const sortField = plan.sort?.field ?? 'date'
  const sortDir = plan.sort?.direction ?? 'asc'
  const sorted = [...rows].sort((a, b) => {
    const av = fieldValue(a, sortField)
    const bv = fieldValue(b, sortField)
    const cmp = av - bv
    return sortDir === 'asc' ? cmp : -cmp
  })
  const limit = plan.limit ?? ASSISTANT_QUERY_LIST_LIMIT
  const page = sorted.slice(0, limit)
  const items = page.map((r) => ({
    kind: r.kind,
    id: r.id,
    displayName: r.displayLabel,
    date: r.date,
    meta: r.locationLine,
    contractValue: r.contractValue,
    remainingAmount: r.remainingAmount,
  }))

  return {
    response: {
      kind: 'collection',
      resource,
      titleLabel: label ?? 'Wynik',
      rangeLabel: rangeLabel ?? null,
      resultCount: rows.length,
      shownCount: items.length,
      items,
      truncated: rows.length > items.length,
      navigate: { path: '/kalendarz', label: 'Otwórz kalendarz' },
    },
    contextPatch: {
      activeCollection: collectionState,
      activeResource: null,
      lastOperation: { type: 'list' },
      pendingClarification: null,
    },
  }
}

/** Public re-export for tests. */
export { validateAssistantQueryPlan }
