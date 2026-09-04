/**
 * One-shot viewport entrance for conversion editorial blocks.
 * CSS-driven opacity/translate only. No scroll-linked setState loops.
 */

import { useEffect, useRef, useState } from 'react'

export function useConversionReveal<T extends HTMLElement = HTMLElement>(reduced: boolean) {
  const ref = useRef<T | null>(null)
  const [revealed, setRevealed] = useState(reduced)

  useEffect(() => {
    if (reduced) return
    const el = ref.current
    if (!el) return
    let done = false
    const io = new IntersectionObserver(
      ([entry]) => {
        if (done || !entry?.isIntersecting) return
        done = true
        setRevealed(true)
        io.disconnect()
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])

  return { ref, revealed }
}
