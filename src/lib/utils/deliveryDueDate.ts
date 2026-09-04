/**
 * Canonical delivery due-date calculator.
 *
 * Converts wedding date + existing relative delivery rule
 * (deliveryMonths / deliveryDays) into a concrete YYYY-MM-DD.
 *
 * Rule preference matches formatDeliveryTerm (months win; days fallback).
 * Months use calendar-month clamp. Days are calendar days.
 * Pure — no DB, network, or persistence. D2 will persist the result.
 */

import {
  addLocalCalendarDays,
  addLocalCalendarMonths,
  isValidLocalCalendarDateKey,
  toLocalCalendarDateKey,
} from '@/lib/utils/localCalendarDate'

export type ResolveDeliveryDueDateInput = {
  weddingDate: string | null | undefined
  deliveryMonths?: number | null
  deliveryDays?: number | null
}

/**
 * Same validity as formatDeliveryTerm: finite and strictly greater than 0.
 * 0 / negative / NaN / Infinity / null are not a term.
 */
export function isValidDeliveryTermCount(
  value: number | null | undefined,
): value is number {
  return value != null && Number.isFinite(value) && value > 0
}

function roundedTermCount(value: number): number {
  return Math.round(value)
}

/**
 * Concrete delivery due date from wedding date + snapshot rule.
 * Returns YYYY-MM-DD or null. Never throws. Never returns "Invalid Date".
 */
export function resolveDeliveryDueDate(
  input: ResolveDeliveryDueDateInput,
): string | null {
  const dateKey = toLocalCalendarDateKey(input.weddingDate?.trim() || null)
  if (!dateKey || !isValidLocalCalendarDateKey(dateKey)) return null

  if (isValidDeliveryTermCount(input.deliveryMonths)) {
    return addLocalCalendarMonths(
      dateKey,
      roundedTermCount(input.deliveryMonths),
    )
  }

  if (isValidDeliveryTermCount(input.deliveryDays)) {
    return addLocalCalendarDays(dateKey, roundedTermCount(input.deliveryDays))
  }

  return null
}
