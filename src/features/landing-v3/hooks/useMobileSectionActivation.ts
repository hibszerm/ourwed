import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tall-section-safe one-shot activation for Landing V3 mobile.
 * Activates once when the section is meaningfully on screen.
 * Never resets on scroll up. Reduced motion / fallback → active.
 */
export function useMobileSectionActivation(options?: {
  reduced?: boolean
  /** Fraction of viewport height that must cover the section top. */
  viewportCoverage?: number
  fallbackMs?: number
}) {
  const nodeRef = useRef<HTMLElement | null>(null)
  const [active, setActive] = useState(false)
  const started = useRef(false)
  const reduced = !!options?.reduced
  const viewportCoverage = options?.viewportCoverage ?? 0.28
  const fallbackMs = options?.fallbackMs ?? 700

  const ref = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node
  }, [])

  useEffect(() => {
    if (reduced) {
      const t = window.setTimeout(() => setActive(true), 0)
      return () => window.clearTimeout(t)
    }

    let cancelled = false
    let io: IntersectionObserver | null = null

    const activate = () => {
      if (cancelled || started.current) return
      started.current = true
      setActive(true)
      io?.disconnect()
      io = null
    }

    const isReady = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      if (rect.bottom <= 0 || rect.top >= vh) return false
      // Heading / top of section in view, with meaningful coverage.
      const visible = Math.max(
        0,
        Math.min(rect.bottom, vh) - Math.max(rect.top, 0),
      )
      const coverage = visible / vh
      const topInView = rect.top < vh * 0.72
      return topInView && coverage >= viewportCoverage
    }

    const check = () => {
      const el = nodeRef.current
      if (!el || cancelled || started.current) return
      if (isReady(el)) activate()
    }

    const observe = () => {
      const el = nodeRef.current
      if (!el || cancelled || started.current) return
      check()
      if (started.current) return

      io = new IntersectionObserver(
        () => check(),
        {
          threshold: [0, 0.1, 0.2, 0.25, 0.3, 0.35, 0.5],
          rootMargin: '0px 0px -12% 0px',
        },
      )
      io.observe(el)
    }

    const raf = window.requestAnimationFrame(observe)
    const fallback = window.setTimeout(activate, fallbackMs + 4000)
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
  }, [reduced, viewportCoverage, fallbackMs])

  return { ref, active }
}
