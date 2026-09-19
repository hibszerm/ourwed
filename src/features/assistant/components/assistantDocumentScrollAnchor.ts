/**
 * Phase 2K.3 — document scroll anchor for mobile Assistant.
 *
 * Physical iPhone telemetry: Safari focus-scrolls the root scrolling element
 * (window/document) when the composer textarea focuses. Overflow:hidden alone
 * does not stop that. Event-driven restore to the opening scroll position.
 *
 * Pure helpers are testable without remounting Assistant / blurring textarea.
 */

export type DocumentScrollAnchor = {
  x: number
  y: number
}

export const ASSISTANT_DOCUMENT_SCROLL_TOLERANCE_PX = 2

/** Capture current window scroll as the open-lifetime anchor. */
export function captureDocumentScrollAnchor(
  win: Pick<Window, 'scrollX' | 'scrollY' | 'pageXOffset' | 'pageYOffset'> = window,
): DocumentScrollAnchor {
  return {
    x: win.scrollX || win.pageXOffset || 0,
    y: win.scrollY || win.pageYOffset || 0,
  }
}

export function readDocumentScroll(
  win: Pick<Window, 'scrollX' | 'scrollY' | 'pageXOffset' | 'pageYOffset'> = window,
): DocumentScrollAnchor {
  return captureDocumentScrollAnchor(win)
}

export function documentScrollDrifted(
  anchor: DocumentScrollAnchor,
  current: DocumentScrollAnchor,
  tolerancePx: number = ASSISTANT_DOCUMENT_SCROLL_TOLERANCE_PX,
): boolean {
  return (
    Math.abs(current.x - anchor.x) > tolerancePx ||
    Math.abs(current.y - anchor.y) > tolerancePx
  )
}

/**
 * Restore window scroll to the opening anchor.
 * Does not touch focus, DOM, or Assistant layout.
 */
export function restoreDocumentScrollAnchor(
  anchor: DocumentScrollAnchor,
  win: Pick<Window, 'scrollTo'> = window,
): void {
  win.scrollTo(anchor.x, anchor.y)
}

/**
 * Pure correction model from physical telemetry / nonzero-page scenarios.
 * Returns the scroll position that MUST hold while Assistant is open.
 */
export function correctDocumentScrollAgainstAnchor(
  anchor: DocumentScrollAnchor,
  attempted: DocumentScrollAnchor,
  tolerancePx: number = ASSISTANT_DOCUMENT_SCROLL_TOLERANCE_PX,
): DocumentScrollAnchor {
  if (!documentScrollDrifted(anchor, attempted, tolerancePx)) {
    return attempted
  }
  return { x: anchor.x, y: anchor.y }
}

/**
 * Real iPhone focus-scroll model (Phase 2K.2-DIAG telemetry).
 * BEFORE: Y=0; AFTER Safari attempt: Y=473 → corrected Y=0.
 */
export const PHYSICAL_IPHONE_FOCUS_SCROLL = {
  before: { x: 0, y: 0 } as DocumentScrollAnchor,
  safariAttempt: { x: 0, y: 473 } as DocumentScrollAnchor,
  corrected: { x: 0, y: 0 } as DocumentScrollAnchor,
  vvBefore: { offsetTop: 0, height: 714, bottom: 714 },
  vvAfter: { offsetTop: 310, height: 404, bottom: 714 },
} as const

/**
 * Nonzero CRM page model: open at 650; Safari jumps to 1123 → restore 650.
 */
export const NONZERO_PAGE_FOCUS_SCROLL = {
  before: { x: 0, y: 650 } as DocumentScrollAnchor,
  safariAttempt: { x: 0, y: 1123 } as DocumentScrollAnchor,
  corrected: { x: 0, y: 650 } as DocumentScrollAnchor,
} as const
