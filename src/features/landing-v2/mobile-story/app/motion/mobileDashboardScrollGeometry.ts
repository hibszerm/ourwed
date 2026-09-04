import { motionValue } from 'framer-motion'

/**
 * Canonical breathing room below the last real Dashboard section
 * (production-like mobile bottom inset — not a fill void).
 */
export const DASHBOARD_BOTTOM_INSET_PX = 20

/**
 * Cached max internal Dashboard travel (px).
 * Updated only on discrete layout / resize measurements — never per scroll frame.
 * Fallback before first measure: 0 (no fake travel).
 */
export const dashboardMaxScrollMv = motionValue(0)

export type DashboardScrollGeometry = {
  viewportHeight: number
  contentExtent: number
  maxScroll: number
}

/**
 * Derive max translate travel from last real section + bottom inset.
 * Uses offset geometry relative to the content root (transform-independent).
 */
export function measureDashboardScrollGeometry(
  viewport: HTMLElement,
  _content: HTMLElement,
  lastSection: HTMLElement,
): DashboardScrollGeometry {
  const viewportHeight = Math.max(0, Math.round(viewport.clientHeight))
  // Ensure offsets resolve against the content root (_content reserved for API symmetry).
  const contentExtent = Math.max(
    0,
    Math.round(lastSection.offsetTop + lastSection.offsetHeight + DASHBOARD_BOTTOM_INSET_PX),
  )
  const maxScroll = Math.max(0, contentExtent - viewportHeight)
  return { viewportHeight, contentExtent, maxScroll }
}

export function publishDashboardMaxScroll(maxScroll: number): void {
  const next = Math.max(0, Math.round(maxScroll))
  if (dashboardMaxScrollMv.get() !== next) {
    dashboardMaxScrollMv.set(next)
  }
}
