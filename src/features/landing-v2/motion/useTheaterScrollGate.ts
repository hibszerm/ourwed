import { useEffect, useRef, type RefObject } from 'react'

export type TheaterScrollGateOptions = {
  /**
   * Extra root margin so measure resumes ~1 viewport before/after the track
   * enters the screen (avoids a cold start mid-theater).
   */
  rootMargin?: string
}

/**
 * Gate continuous scroll→rAF measure work to near-viewport sticky theaters.
 *
 * Uses IntersectionObserver — not user-agent sniffing.
 * Read `activeRef.current` inside scroll handlers (no React re-render per frame).
 * Assign `onBecameActiveRef.current = measure` so re-entry remeasures once.
 */
export function useTheaterScrollGate(
  trackRef: RefObject<Element | null>,
  enabled: boolean,
  options?: TheaterScrollGateOptions,
): {
  activeRef: { current: boolean }
  onBecameActiveRef: { current: (() => void) | null }
} {
  const activeRef = useRef(true)
  const onBecameActiveRef = useRef<(() => void) | null>(null)
  const rootMargin = options?.rootMargin ?? '100% 0px 100% 0px'

  useEffect(() => {
    if (!enabled) {
      activeRef.current = true
      return
    }
    const el = trackRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      activeRef.current = true
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        const next = Boolean(entry?.isIntersecting)
        const was = activeRef.current
        activeRef.current = next
        if (next && !was) onBecameActiveRef.current?.()
      },
      { root: null, rootMargin, threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [enabled, trackRef, rootMargin])

  return { activeRef, onBecameActiveRef }
}
