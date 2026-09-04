import { useLayoutEffect, type RefObject } from 'react'

const MOBILE_DASHBOARD_QUERY = '(max-width: 767px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * One-shot mobile section reveals. The observer mutates presentation attributes
 * directly, so scrolling never causes a React render.
 */
export function useDashboardMobileReveals(
  rootRef: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useLayoutEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    if (!root || typeof window === 'undefined') return

    const targets = Array.from(
      root.querySelectorAll<HTMLElement>('[data-mobile-reveal]'),
    )
    if (targets.length === 0) return

    const mobile = window.matchMedia(MOBILE_DASHBOARD_QUERY)
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY)
    let observer: IntersectionObserver | null = null

    const reveal = (target: HTMLElement) => {
      target.dataset.mobileReveal = 'shown'
    }

    const revealAll = () => {
      targets.forEach(reveal)
    }

    const start = () => {
      observer?.disconnect()
      observer = null

      if (
        !mobile.matches ||
        reducedMotion.matches ||
        !('IntersectionObserver' in window)
      ) {
        revealAll()
        return
      }

      root.dataset.mobileRevealReady = 'true'
      let remaining = targets.filter(
        (target) => target.dataset.mobileReveal !== 'shown',
      ).length

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLElement
            const passedAbove =
              entry.boundingClientRect.bottom <=
              (entry.rootBounds?.top ?? 0)
            if (!entry.isIntersecting && !passedAbove) continue

            reveal(target)
            observer?.unobserve(target)
            remaining -= 1
          }
          if (remaining <= 0) {
            observer?.disconnect()
            observer = null
          }
        },
        {
          root: null,
          rootMargin: '0px 0px -8% 0px',
          threshold: 0.08,
        },
      )

      targets
        .filter((target) => target.dataset.mobileReveal !== 'shown')
        .forEach((target) => observer?.observe(target))
    }

    start()
    mobile.addEventListener('change', start)
    reducedMotion.addEventListener('change', start)

    return () => {
      observer?.disconnect()
      mobile.removeEventListener('change', start)
      reducedMotion.removeEventListener('change', start)
      delete root.dataset.mobileRevealReady
    }
  }, [enabled, rootRef])
}
