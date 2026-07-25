/**
 * Viewport helpers for floating popovers and mobile dialogs.
 * Prefer visualViewport when available (mobile keyboard).
 */

import { readVisualViewportBounds } from '@/components/ui/visualViewportBounds'

export interface FloatingRect {
  top: number
  left: number
  width: number
  height: number
}

export interface FloatingPlacementResult {
  top: number
  left: number
  width: number
  maxHeight: number
  /** Full visible height when mode is dialog. */
  height?: number
  placement: 'below' | 'above'
  /** anchored = desktop popover; dialog = full visualViewport mobile dialog. */
  mode: 'anchored' | 'dialog'
}

export interface ComputeFloatingOptions {
  gap?: number
  minSpace?: number
  maxMenuHeight?: number
  padding?: number
  /** Force full-viewport dialog mode (mobile). */
  forceSheet?: boolean
  forceDialog?: boolean
  /** @deprecated Half-height sheets are no longer used. Ignored. */
  sheetFraction?: number
}

export const MOBILE_OVERLAY_BREAKPOINT = 640

export function isMobileOverlayViewport(width = viewportWidth()): boolean {
  return width < MOBILE_OVERLAY_BREAKPOINT
}

export function viewportWidth(): number {
  if (typeof window === 'undefined') return 1024
  return window.visualViewport?.width ?? window.innerWidth
}

export function viewportHeight(): number {
  if (typeof window === 'undefined') return 768
  return window.visualViewport?.height ?? window.innerHeight
}

export function visualViewportOffset(): {
  offsetTop: number
  offsetLeft: number
} {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return { offsetTop: 0, offsetLeft: 0 }
  }
  return {
    offsetTop: window.visualViewport.offsetTop,
    offsetLeft: window.visualViewport.offsetLeft,
  }
}

/**
 * Place a floating panel below the anchor when space allows, otherwise above.
 * On narrow viewports (or forceDialog), return full visualViewport dialog metrics.
 */
export function computeFloatingPlacement(
  anchor: FloatingRect,
  viewport: { width: number; height: number },
  options?: ComputeFloatingOptions,
): FloatingPlacementResult {
  const gap = options?.gap ?? 4
  const minSpace = options?.minSpace ?? 120
  const maxMenuHeight = options?.maxMenuHeight ?? 280
  const padding = options?.padding ?? 8
  const useDialog =
    options?.forceDialog === true ||
    options?.forceSheet === true ||
    isMobileOverlayViewport(viewport.width)

  if (useDialog) {
    const bounds = readVisualViewportBounds()
    return {
      top: bounds.top,
      left: bounds.left,
      width: bounds.width,
      maxHeight: bounds.height,
      height: bounds.height,
      placement: 'below',
      mode: 'dialog',
    }
  }

  const spaceBelow =
    viewport.height - anchor.top - anchor.height - gap - padding
  const spaceAbove = anchor.top - gap - padding
  const placeBelow = spaceBelow >= minSpace || spaceBelow >= spaceAbove

  const maxHeight = Math.max(
    80,
    Math.min(maxMenuHeight, placeBelow ? spaceBelow : spaceAbove),
  )

  const width = Math.max(
    0,
    Math.min(anchor.width, viewport.width - padding * 2),
  )
  let left = anchor.left
  if (left + width > viewport.width - padding) {
    left = Math.max(padding, viewport.width - padding - width)
  }
  if (left < padding) left = padding

  if (placeBelow) {
    return {
      top: anchor.top + anchor.height + gap,
      left,
      width,
      maxHeight,
      placement: 'below',
      mode: 'anchored',
    }
  }

  return {
    top: Math.max(padding, anchor.top - gap - maxHeight),
    left,
    width,
    maxHeight,
    placement: 'above',
    mode: 'anchored',
  }
}

export function rectFromElement(el: Element): FloatingRect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export function viewportSize(): { width: number; height: number } {
  return {
    width: viewportWidth(),
    height: viewportHeight(),
  }
}
