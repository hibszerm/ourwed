/**
 * Viewport helpers for floating popovers and mobile sheets.
 * Prefer visualViewport when available (mobile keyboard).
 */

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
  placement: 'below' | 'above'
  mode: 'anchored' | 'sheet'
}

export interface ComputeFloatingOptions {
  gap?: number
  minSpace?: number
  maxMenuHeight?: number
  padding?: number
  /** Force sheet mode (mobile). */
  forceSheet?: boolean
  /** Sheet height as fraction of visible viewport (0–1). */
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

export function visualViewportOffset(): { offsetTop: number; offsetLeft: number } {
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
 * On narrow viewports (or forceSheet), return sheet-mode metrics.
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
  const sheetFraction = options?.sheetFraction ?? 0.48
  const useSheet =
    options?.forceSheet === true || isMobileOverlayViewport(viewport.width)

  if (useSheet) {
    const maxHeight = Math.max(
      160,
      Math.min(viewport.height * sheetFraction, viewport.height - padding * 2),
    )
    const { offsetTop } = visualViewportOffset()
    return {
      top: offsetTop + viewport.height - maxHeight - padding,
      left: padding,
      width: Math.max(0, viewport.width - padding * 2),
      maxHeight,
      placement: 'above',
      mode: 'sheet',
    }
  }

  const spaceBelow = viewport.height - anchor.top - anchor.height - gap - padding
  const spaceAbove = anchor.top - gap - padding
  const placeBelow = spaceBelow >= minSpace || spaceBelow >= spaceAbove

  const maxHeight = Math.max(
    80,
    Math.min(maxMenuHeight, placeBelow ? spaceBelow : spaceAbove),
  )

  const width = Math.max(0, Math.min(anchor.width, viewport.width - padding * 2))
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
