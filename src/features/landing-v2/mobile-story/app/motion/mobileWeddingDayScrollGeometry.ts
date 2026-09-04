import { motionValue } from 'framer-motion'

/** Natural bottom inset for Wedding Day final frame (Brief fully readable). */
export const WEDDING_DAY_BOTTOM_INSET_PX = 16

export type WeddingDayScrollGeometry = {
  viewportHeight: number
  contentExtent: number
  maxScroll: number
}

/**
 * Cached Wedding Day max internal travel (px).
 * Updated only on ResizeObserver / discrete measure — never per scroll frame.
 */
export const weddingDayMaxScrollMv = motionValue(0)

export function measureWeddingDayScrollGeometry(
  viewport: HTMLElement,
  _content: HTMLElement,
  lastSection: HTMLElement,
): WeddingDayScrollGeometry {
  const viewportHeight = Math.max(0, Math.round(viewport.clientHeight))
  const contentExtent = Math.max(
    0,
    Math.round(
      lastSection.offsetTop + lastSection.offsetHeight + WEDDING_DAY_BOTTOM_INSET_PX,
    ),
  )
  const maxScroll = Math.max(0, contentExtent - viewportHeight)
  return { viewportHeight, contentExtent, maxScroll }
}

export function publishWeddingDayMaxScroll(maxScroll: number): void {
  const next = Math.max(0, Math.round(maxScroll))
  if (weddingDayMaxScrollMv.get() !== next) {
    weddingDayMaxScrollMv.set(next)
  }
}
