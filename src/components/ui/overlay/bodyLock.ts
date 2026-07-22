/**
 * Nested-safe body scroll lock for overlays (modal / drawer).
 * Multiple open overlays share one lock; unlock restores only when the last closes.
 */

let lockCount = 0
let previousOverflow = ''
let previousPaddingRight = ''

function scrollbarGap(): number {
  return window.innerWidth - document.documentElement.clientWidth
}

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow
    previousPaddingRight = document.body.style.paddingRight
    const gap = scrollbarGap()
    document.body.style.overflow = 'hidden'
    if (gap > 0) {
      document.body.style.paddingRight = `${gap}px`
    }
  }
  lockCount += 1
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow
    document.body.style.paddingRight = previousPaddingRight
  }
}

/** Mark app root inert so nothing underneath is focusable / clickable. */
let inertCount = 0

export function setAppInert(active: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.getElementById('root')
  if (!root) return

  if (active) {
    inertCount += 1
    if (inertCount === 1) {
      root.setAttribute('inert', '')
      root.setAttribute('aria-hidden', 'true')
    }
  } else {
    inertCount = Math.max(0, inertCount - 1)
    if (inertCount === 0) {
      root.removeAttribute('inert')
      root.removeAttribute('aria-hidden')
    }
  }
}
