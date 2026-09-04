/**
 * Wedding delivery deadline snapshot + policy.
 *
 * Relative rule (deliveryMonths / deliveryDays) stays the contractual snapshot.
 * Concrete due date / source / completedAt are wedding-specific.
 *
 * Does not touch final payment, tasks, contracts, or a persisted delivery status.
 */

import {
  isValidDeliveryTermCount,
  resolveDeliveryDueDate,
} from '@/lib/utils/deliveryDueDate'
import {
  localCalendarDateKey,
  toLocalCalendarDateKey,
} from '@/lib/utils/localCalendarDate'
import { formatDate } from '@/lib/utils/dates'
import type { Wedding } from '@/types/wedding'

export type DeliveryDueSource = 'package' | 'manual'

export type DeliveryTermUnit = 'months' | 'calendar_days'

export type DeliveryDeadlineState =
  | 'none'
  | 'completed'
  | 'overdue'
  | 'due_today'
  | 'upcoming'

export type DeliveryDeadlineFields = {
  deliveryDueDate: string | null
  deliveryDueSource: DeliveryDueSource | null
  deliveryCompletedAt: string | null
}

type DeliveryRuleInput = {
  date?: string | null
  deliveryMonths?: number | null
  deliveryDays?: number | null
  deliveryDueDate?: string | null
  deliveryDueSource?: DeliveryDueSource | null
  deliveryCompletedAt?: string | null
}

export function snapshotDeliveryDeadlineFromRule(input: {
  weddingDate: string | null | undefined
  deliveryMonths?: number | null
  deliveryDays?: number | null
}): DeliveryDeadlineFields {
  const deliveryDueDate = resolveDeliveryDueDate({
    weddingDate: input.weddingDate,
    deliveryMonths: input.deliveryMonths,
    deliveryDays: input.deliveryDays,
  })
  return {
    deliveryDueDate,
    deliveryDueSource: deliveryDueDate ? 'package' : null,
    deliveryCompletedAt: null,
  }
}

/**
 * After date or relative-rule changes:
 * - completed: preserve due + completion
 * - manual: preserve concrete due
 * - otherwise: recompute from next date + next months/days
 */
export function reconcileDeliveryDeadline(input: {
  previous: DeliveryRuleInput
  next: DeliveryRuleInput
}): DeliveryDeadlineFields {
  const completedAt = input.previous.deliveryCompletedAt?.trim() || null
  if (completedAt) {
    return {
      deliveryDueDate: input.previous.deliveryDueDate?.trim() || null,
      deliveryDueSource: input.previous.deliveryDueSource ?? null,
      deliveryCompletedAt: completedAt,
    }
  }

  if (input.previous.deliveryDueSource === 'manual') {
    return {
      deliveryDueDate: input.previous.deliveryDueDate?.trim() || null,
      deliveryDueSource: 'manual',
      deliveryCompletedAt: null,
    }
  }

  return snapshotDeliveryDeadlineFromRule({
    weddingDate: input.next.date,
    deliveryMonths: input.next.deliveryMonths,
    deliveryDays: input.next.deliveryDays,
  })
}

export function applyManualDeliveryDueDate(
  dueDate: string,
  completedAt?: string | null,
): DeliveryDeadlineFields {
  const key = toLocalCalendarDateKey(dueDate.trim())
  return {
    deliveryDueDate: key,
    deliveryDueSource: key ? 'manual' : null,
    deliveryCompletedAt: completedAt?.trim() || null,
  }
}

export function restorePackageDeliveryDueDate(
  wedding: DeliveryRuleInput,
): DeliveryDeadlineFields {
  const snap = snapshotDeliveryDeadlineFromRule({
    weddingDate: wedding.date,
    deliveryMonths: wedding.deliveryMonths,
    deliveryDays: wedding.deliveryDays,
  })
  return {
    ...snap,
    deliveryCompletedAt: wedding.deliveryCompletedAt?.trim() || null,
  }
}

/** Merge next wedding fields with deadline policy after date/rule changes. */
export function withReconciledDeliveryDeadline<T extends DeliveryRuleInput>(
  previous: DeliveryRuleInput,
  next: T,
): T & DeliveryDeadlineFields {
  return {
    ...next,
    ...reconcileDeliveryDeadline({ previous, next }),
  }
}

export function markDeliveryCompleted(
  wedding: {
    deliveryDueDate?: string | null
    deliveryDueSource?: DeliveryDueSource | null
    deliveryCompletedAt?: string | null
  },
  completedAt: string = new Date().toISOString(),
): DeliveryDeadlineFields {
  return {
    deliveryDueDate: wedding.deliveryDueDate ?? null,
    deliveryDueSource: wedding.deliveryDueSource ?? null,
    deliveryCompletedAt: completedAt,
  }
}

export function undoDeliveryCompleted(
  wedding: {
    deliveryDueDate?: string | null
    deliveryDueSource?: DeliveryDueSource | null
    deliveryCompletedAt?: string | null
  },
): DeliveryDeadlineFields {
  return {
    deliveryDueDate: wedding.deliveryDueDate ?? null,
    deliveryDueSource: wedding.deliveryDueSource ?? null,
    deliveryCompletedAt: null,
  }
}

export function getDeliveryDeadlineState(input: {
  deliveryDueDate?: string | null
  deliveryCompletedAt?: string | null
  todayKey?: string
}): DeliveryDeadlineState {
  if (input.deliveryCompletedAt?.trim()) return 'completed'
  const due = toLocalCalendarDateKey(input.deliveryDueDate)
  if (!due) return 'none'
  const today = input.todayKey ?? localCalendarDateKey()
  if (due < today) return 'overdue'
  if (due === today) return 'due_today'
  return 'upcoming'
}

function completedCalendarKey(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return localCalendarDateKey(parsed)
  return toLocalCalendarDateKey(raw)
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = new Date(fy!, fm! - 1, fd!)
  const to = new Date(ty!, tm! - 1, td!)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export function formatDeliveryRelativeContext(input: {
  state: DeliveryDeadlineState
  deliveryDueDate?: string | null
  deliveryCompletedAt?: string | null
  todayKey?: string
}): string | null {
  if (input.state === 'none') return null
  if (input.state === 'completed') {
    const completed = completedCalendarKey(input.deliveryCompletedAt)
    return completed
      ? `Oddano ${formatDate(completed, { month: 'short' })}`
      : 'Oddane'
  }
  const due = toLocalCalendarDateKey(input.deliveryDueDate)
  if (!due) return null
  const today = input.todayKey ?? localCalendarDateKey()
  if (input.state === 'due_today') return 'dzisiaj'
  if (input.state === 'overdue') {
    const n = daysBetweenKeys(due, today)
    return n === 1 ? '1 dzień po terminie' : `${n} dni po terminie`
  }
  const n = daysBetweenKeys(today, due)
  return n === 1 ? 'za 1 dzień' : `za ${n} dni`
}

export function getDeliveryDeadlineBand(wedding: Pick<
  Wedding,
  'deliveryDueDate' | 'deliveryCompletedAt'
> & {
  todayKey?: string
}): {
  dueLabel: string
  contextLabel: string | null
  state: DeliveryDeadlineState
} {
  const state = getDeliveryDeadlineState({
    deliveryDueDate: wedding.deliveryDueDate,
    deliveryCompletedAt: wedding.deliveryCompletedAt,
    todayKey: wedding.todayKey,
  })
  const due = toLocalCalendarDateKey(wedding.deliveryDueDate)
  return {
    state,
    dueLabel: due ? formatDate(due, { month: 'short' }) : '—',
    contextLabel: formatDeliveryRelativeContext({
      state,
      deliveryDueDate: wedding.deliveryDueDate,
      deliveryCompletedAt: wedding.deliveryCompletedAt,
      todayKey: wedding.todayKey,
    }),
  }
}

export function readDeliveryTermForm(
  months: number | null | undefined,
  days: number | null | undefined,
): { unit: DeliveryTermUnit; value: string } {
  if (isValidDeliveryTermCount(months)) {
    return { unit: 'months', value: String(Math.round(months)) }
  }
  if (isValidDeliveryTermCount(days)) {
    return { unit: 'calendar_days', value: String(Math.round(days)) }
  }
  return { unit: 'months', value: '' }
}

export function writeDeliveryTermForm(
  unit: DeliveryTermUnit,
  rawValue: string,
): { deliveryMonths: number | null; deliveryDays: number | null } {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return { deliveryMonths: null, deliveryDays: null }
  }
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) {
    return { deliveryMonths: null, deliveryDays: null }
  }
  const rounded = Math.round(n)
  if (unit === 'months') {
    return { deliveryMonths: rounded, deliveryDays: null }
  }
  return { deliveryMonths: null, deliveryDays: rounded }
}

export function applyDeliveryTermFormToWedding(
  wedding: DeliveryRuleInput,
  unit: DeliveryTermUnit,
  rawValue: string,
): {
  deliveryMonths: number | null
  deliveryDays: number | null
} & DeliveryDeadlineFields {
  const terms = writeDeliveryTermForm(unit, rawValue)
  return {
    ...terms,
    ...reconcileDeliveryDeadline({
      previous: wedding,
      next: { ...wedding, ...terms },
    }),
  }
}

export function parseDeliveryDueSource(
  value: string | null | undefined,
): DeliveryDueSource | null {
  if (value === 'package' || value === 'manual') return value
  return null
}
