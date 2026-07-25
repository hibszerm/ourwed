/**
 * iOS-safe body scroll lock that preserves and restores document scroll.
 */

let lockCount = 0
let savedScrollY = 0
let savedBodyStyle: {
  position: string
  top: string
  left: string
  right: string
  width: string
  overflow: string
} | null = null

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return
  lockCount += 1
  if (lockCount > 1) return

  const body = document.body
  savedScrollY = window.scrollY || window.pageYOffset || 0
  savedBodyStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  }

  body.style.position = 'fixed'
  body.style.top = `-${savedScrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  body.style.width = '100%'
  body.style.overflow = 'hidden'
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (lockCount === 0) return
  lockCount -= 1
  if (lockCount > 0) return

  const body = document.body
  const y = savedScrollY
  if (savedBodyStyle) {
    body.style.position = savedBodyStyle.position
    body.style.top = savedBodyStyle.top
    body.style.left = savedBodyStyle.left
    body.style.right = savedBodyStyle.right
    body.style.width = savedBodyStyle.width
    body.style.overflow = savedBodyStyle.overflow
  } else {
    body.style.position = ''
    body.style.top = ''
    body.style.left = ''
    body.style.right = ''
    body.style.width = ''
    body.style.overflow = ''
  }
  savedBodyStyle = null
  window.scrollTo(0, y)
  savedScrollY = 0
}

/** Test helper — reset lock state between isolated unit tests. */
export function __resetBodyScrollLockForTests(): void {
  lockCount = 0
  savedScrollY = 0
  savedBodyStyle = null
  if (typeof document !== 'undefined') {
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.left = ''
    document.body.style.right = ''
    document.body.style.width = ''
    document.body.style.overflow = ''
  }
}
