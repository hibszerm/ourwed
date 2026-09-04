import { getDaysUntil } from '@/lib/utils/dates'

/**
 * Mobile-relative copy for an assignment date.
 * Presentation only: the underlying nearest/next assignment selectors stay shared.
 */
export function dashboardAssignmentRelativeLabel(dateKey: string): string {
  const days = getDaysUntil(dateKey)
  if (days === 0) return 'Dziś'
  if (days === 1) return 'Jutro'
  return `Za ${days} dni`
}

const EMPTY_ASSIGNMENT_MONOGRAM = 'OW'

/**
 * Compact-bar monogram from the same display name already shown in the bar.
 * Presentation only — does not select or rewrite assignment identity.
 */
export function compactAssignmentMonogram(
  title: string | null | undefined,
): string {
  const visible = title?.trim() ?? ''
  if (!visible) return EMPTY_ASSIGNMENT_MONOGRAM
  const first = Array.from(visible)[0]
  if (!first) return EMPTY_ASSIGNMENT_MONOGRAM
  return first.toLocaleUpperCase('pl-PL')
}

interface CompactAssignmentBoundary {
  active: boolean
  isIntersecting: boolean
  intersectionRatio: number
  sentinelTop: number
  sentinelBottom: number
  thresholdTop: number
}

/**
 * Stable two-boundary state:
 * - enter only after the sentinel has fully passed above app chrome,
 * - exit only after virtually the whole sentinel has returned below it.
 *
 * The 10px sentinel supplies physical hysteresis without a scroll listener.
 */
export function resolveCompactAssignmentVisibility({
  active,
  isIntersecting,
  intersectionRatio,
  sentinelTop,
  sentinelBottom,
  thresholdTop,
}: CompactAssignmentBoundary): boolean {
  if (!active) {
    return !isIntersecting && sentinelBottom <= thresholdTop
  }

  const fullyReturned =
    isIntersecting &&
    intersectionRatio >= 0.98 &&
    sentinelTop >= thresholdTop - 0.5

  return !fullyReturned
}
