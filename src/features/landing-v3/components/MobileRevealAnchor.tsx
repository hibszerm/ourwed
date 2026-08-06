import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: (active: boolean) => ReactNode
  className?: string
  reduced?: boolean
  fallbackMs?: number
}

/**
 * Activation anchor for mobile product artboards.
 * Observes the artboard itself (not the tall section). Once-only.
 */
export function MobileRevealAnchor({
  children,
  className = '',
  reduced = false,
  fallbackMs = 700,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(reduced)
  const started = useRef(reduced)

  const activate = useCallback(() => {
    if (started.current) return
    started.current = true
    setActive(true)
  }, [])

  useEffect(() => {
    if (reduced) {
      activate()
      return
    }

    const el = ref.current
    if (!el) return
    let cancelled = false

    const check = () => {
      if (cancelled || started.current) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      if (rect.bottom <= 0 || rect.top >= vh) return
      const visible = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0))
      const coverage = visible / Math.max(rect.height, 1)
      const topOk = rect.top < vh * 0.72
      if (topOk && (coverage >= 0.08 || visible / vh >= 0.12)) activate()
    }

    const io = new IntersectionObserver(() => check(), {
      threshold: [0, 0.15, 0.25, 0.35, 0.45, 0.55],
      rootMargin: '0px 0px -10% 0px',
    })
    io.observe(el)
    check()

    const fallback = window.setTimeout(activate, fallbackMs)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)

    return () => {
      cancelled = true
      io.disconnect()
      window.clearTimeout(fallback)
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [activate, reduced, fallbackMs])

  return (
    <div
      ref={ref}
      className={className}
      data-mobile-reveal-anchor=""
      data-reveal-active={active ? 'true' : 'false'}
      style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
    >
      {children(active)}
    </div>
  )
}
