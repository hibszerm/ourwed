import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Shared section reveal — fires once at the given visibility threshold.
 * No child observers. No scroll progress. Motion may enhance only.
 */
export function useSectionReveal(options?: {
  threshold?: number
  reduced?: boolean
}) {
  const nodeRef = useRef<HTMLElement | null>(null)
  const [active, setActive] = useState(false)
  const started = useRef(false)
  const threshold = options?.threshold ?? 0.55
  const reduced = !!options?.reduced

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

    const visibleRatio = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect()
      if (rect.height <= 0) return 0
      const visible =
        Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
      return visible / rect.height
    }

    const check = () => {
      const el = nodeRef.current
      if (!el || cancelled || started.current) return
      if (visibleRatio(el) >= threshold) activate()
    }

    const observe = () => {
      const el = nodeRef.current
      if (!el || cancelled || started.current) return

      check()
      if (started.current) return

      io = new IntersectionObserver(
        ([entry]) => {
          if (
            entry?.isIntersecting &&
            entry.intersectionRatio >= threshold
          ) {
            activate()
          }
        },
        {
          threshold: [
            0, 0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.85, 1,
          ],
        },
      )
      io.observe(el)
    }

    // Callback ref may assign after this effect's first paint.
    const raf = window.requestAnimationFrame(observe)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      io?.disconnect()
    }
  }, [reduced, threshold])

  return { ref, active }
}
