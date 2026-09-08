import { useEffect, useRef, useState } from 'react'

/** Condenses nav styling after a short scroll — boolean flip only (no per-px React). */
export function useScrolled(threshold = 24): boolean {
  const [scrolled, setScrolled] = useState(false)
  const scrolledRef = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > threshold
      if (next === scrolledRef.current) return
      scrolledRef.current = next
      setScrolled(next)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return scrolled
}
