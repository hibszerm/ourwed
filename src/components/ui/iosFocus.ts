/**
 * iOS Safari focus helpers — blur / settle / preventScroll focus.
 * Keeps keyboard + auto-zoom transitions from fighting route/dialog close.
 */

/** Blur the current text control if one is focused. */
export function blurActiveElement(): void {
  if (typeof document === 'undefined') return
  const el = document.activeElement
  if (el instanceof HTMLElement && typeof el.blur === 'function') {
    el.blur()
  }
}

/**
 * Wait one paint + one frame so Safari can start dismissing the keyboard
 * after blur. Intentionally short — not a long timeout.
 */
export function settleAfterBlur(): Promise<void> {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/** Focus without scrolling the page (Safari-safe fallback). */
export function focusWithoutScroll(el: HTMLElement): void {
  try {
    el.focus({ preventScroll: true })
  } catch {
    el.focus()
  }
}
