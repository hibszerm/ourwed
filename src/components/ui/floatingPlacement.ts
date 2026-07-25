/**
 * Viewport-aware floating position for portalled popovers.
 * No Floating UI / Radix dependency — pure layout math.
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
}

export interface ComputeFloatingOptions {
  /** Preferred gap between anchor and menu (px). */
  gap?: number
  /** Minimum menu height before flipping (px). */
  minSpace?: number
  /** Max menu height cap (px). */
  maxMenuHeight?: number
  /** Viewport padding (px). */
  padding?: number
}

/**
 * Place a floating panel below the anchor when space allows, otherwise above.
 * Width matches the anchor; position stays inside the viewport.
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
    }
  }

  return {
    top: Math.max(padding, anchor.top - gap - maxHeight),
    left,
    width,
    maxHeight,
    placement: 'above',
  }
}

export function rectFromElement(el: Element): FloatingRect {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export function viewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}
