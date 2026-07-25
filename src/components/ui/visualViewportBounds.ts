/**
 * visualViewport geometry for iOS-safe mobile overlays.
 * Prefer visualViewport over window.innerHeight when the keyboard is open.
 */

export interface VisualViewportBounds {
  top: number
  left: number
  width: number
  height: number
  /** True when bounds came from window.visualViewport. */
  fromVisualViewport: boolean
}

/** Read current visible browser viewport (keyboard-aware). */
export function readVisualViewportBounds(
  win: Window = typeof window !== 'undefined' ? window : (undefined as unknown as Window),
): VisualViewportBounds {
  if (typeof win === 'undefined' || !win) {
    return {
      top: 0,
      left: 0,
      width: 1024,
      height: 768,
      fromVisualViewport: false,
    }
  }
  const vv = win.visualViewport
  if (vv) {
    return {
      top: vv.offsetTop,
      left: vv.offsetLeft,
      width: vv.width,
      height: vv.height,
      fromVisualViewport: true,
    }
  }
  return {
    top: 0,
    left: 0,
    width: win.innerWidth,
    height: win.innerHeight,
    fromVisualViewport: false,
  }
}

export type VisualViewportListener = (bounds: VisualViewportBounds) => void

/**
 * Subscribe to visualViewport + window geometry changes.
 * Returns an unsubscribe function (always safe to call).
 */
export function subscribeVisualViewport(
  listener: VisualViewportListener,
  win: Window = typeof window !== 'undefined' ? window : (undefined as unknown as Window),
): () => void {
  if (typeof win === 'undefined' || !win) {
    return () => undefined
  }

  const notify = () => listener(readVisualViewportBounds(win))
  notify()

  win.addEventListener('resize', notify)
  win.addEventListener('orientationchange', notify)
  const vv = win.visualViewport
  vv?.addEventListener('resize', notify)
  vv?.addEventListener('scroll', notify)

  return () => {
    win.removeEventListener('resize', notify)
    win.removeEventListener('orientationchange', notify)
    vv?.removeEventListener('resize', notify)
    vv?.removeEventListener('scroll', notify)
  }
}
