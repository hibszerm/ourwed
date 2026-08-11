import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Shared section reveal — fires once at the given visibility threshold.
 * Tall sections use an adaptive threshold so short viewports can still activate.
 * No child observers. No scroll progress. Motion may enhance only.
 */
export function useSectionReveal(options?: {
  threshold?: number
  reduced?: boolean
  /**
   * When set (e.g. 0.72), activate once the observed top crosses this
   * fraction of the viewport — used for scaled desktop canvases on mobile.
   */
  topTriggerRatio?: number
  /**
   * If the observed node scrolls fully above the viewport before/during
   * activation, jump to the completed state (fast-scroll fallback).
   */
  forceCompleteOnExitAbove?: boolean
}) {
  const nodeRef = useRef<HTMLElement | null>(null)
  const [active, setActive] = useState(false)
  /** True when activation came from exit-above (skip long in-flight timelines). */
  const [instantComplete, setInstantComplete] = useState(false)
  const started = useRef(false)
  const threshold = options?.threshold ?? 0.55
  const reduced = !!options?.reduced
  const topTriggerRatio = options?.topTriggerRatio
  const forceCompleteOnExitAbove = !!options?.forceCompleteOnExitAbove

  const ref = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node
  }, [])

  useEffect(() => {
    if (reduced) {
      const t = window.setTimeout(() => {
        setInstantComplete(true)
        setActive(true)
      }, 0)
      return () => window.clearTimeout(t)
    }

    let cancelled = false
    let io: IntersectionObserver | null = null
    let sawNearViewport = false

    const activate = (opts?: { instant?: boolean }) => {
      if (cancelled || started.current) return
      started.current = true
      if (opts?.instant) setInstantComplete(true)
      setActive(true)
      io?.disconnect()
      io = null
    }

    const effectiveThreshold = (el: HTMLElement) => {
      const h = Math.max(el.getBoundingClientRect().height, 1)
      const maxPossible = (window.innerHeight * 0.9) / h
      return Math.min(threshold, Math.max(0.22, maxPossible * 0.92))
    }

    const visibleRatio = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect()
      if (rect.height <= 0) return 0
      const visible =
        Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
      return visible / rect.height
    }

    const check = () => {
      const el = nodeRef.current
      if (!el || cancelled) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1

      if (rect.bottom > 0 && rect.top < vh) {
        sawNearViewport = true
      }

      if (started.current) {
        // Mid-flight fast-scroll: jump visuals to final (no long invisible timers).
        if (
          forceCompleteOnExitAbove &&
          sawNearViewport &&
          rect.bottom < 0
        ) {
          setInstantComplete(true)
        }
        return
      }

      // Fast-scroll: node left upward after being near — finish to final state.
      if (
        forceCompleteOnExitAbove &&
        sawNearViewport &&
        rect.bottom < 0
      ) {
        activate({ instant: true })
        return
      }

      if (topTriggerRatio != null) {
        const near =
          rect.top < vh * topTriggerRatio && rect.bottom > 0
        const coverage = visibleRatio(el)
        if (near && coverage >= Math.min(threshold, 0.05)) activate()
        return
      }
      if (visibleRatio(el) >= effectiveThreshold(el)) activate()
    }

    const observe = () => {
      const el = nodeRef.current
      if (!el || cancelled || started.current) return

      check()
      if (started.current) return

      io = new IntersectionObserver(
        () => check(),
        {
          threshold: [
            0, 0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.85, 1,
          ],
        },
      )
      io.observe(el)
    }

    const raf = window.requestAnimationFrame(observe)
    const fallback = window.setTimeout(() => {
      const el = nodeRef.current
      if (!el || started.current) return
      const rect = el.getBoundingClientRect()
      if (rect.top < window.innerHeight && rect.bottom > 0) activate()
    }, 5200)

    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      window.clearTimeout(fallback)
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
      io?.disconnect()
    }
  }, [reduced, threshold, topTriggerRatio, forceCompleteOnExitAbove])

  return { ref, active, instantComplete }
}
