/**
 * Nested-safe body scroll lock for overlays (modal / drawer).
 * Multiple open overlays share one lock; unlock restores only when the last closes.
 *
 * Phase 2K: locks overflow on html+body WITHOUT position:fixed.
 * position:fixed body locks fight Safari focused-input reveal inside full-screen chats.
 */

let lockCount = 0
let previousOverflow = ''
let previousHtmlOverflow = ''
let previousPaddingRight = ''
let savedScrollY = 0

function scrollbarGap(): number {
  return window.innerWidth - document.documentElement.clientWidth
}

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (lockCount === 0) {
    savedScrollY = window.scrollY || window.pageYOffset || 0
    previousOverflow = document.body.style.overflow
    previousHtmlOverflow = document.documentElement.style.overflow
    previousPaddingRight = document.body.style.paddingRight
    const gap = scrollbarGap()
    document.documentElement.style.overflow = 'hidden'
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
    document.documentElement.style.overflow = previousHtmlOverflow
    document.body.style.paddingRight = previousPaddingRight
    const y = savedScrollY
    savedScrollY = 0
    if (y > 0 || window.scrollY !== y) {
      window.scrollTo(0, y)
    }
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
