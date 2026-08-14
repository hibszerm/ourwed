import { useEffect, useRef } from 'react'
import { formatCurrency } from '@/lib/utils/currency'
import {
  FINANCE_COUNT_MS,
  FINANCE_COUNT_MS_MOBILE,
  financeIsMobileViewport,
  financeSmoothstep,
} from '@/features/finance/financeMotion'
import type { FinanceRevealPhase } from '@/features/finance/useFinanceEntranceReveal'
import styles from '@/features/finance/FinanceCenter.module.css'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

interface AnimatedCurrencyValueProps {
  value: number
  /** Page-entry phase from useFinanceEntranceReveal — count-up only during `play`. */
  reveal: FinanceRevealPhase
  /** Organic offset from play start (KPI / summary micro-stagger). */
  delayMs?: number
  /** Override duration; defaults to desktop/mobile Finance count tokens. */
  durationMs?: number
  className?: string
}

/**
 * Presentation-only currency display. Does not touch Finance business state.
 * Count-up runs once on page entrance; later value changes snap (no 0→value replay).
 * Visual span is aria-hidden; SR reads a stable final value only.
 */
export function AnimatedCurrencyValue({
  value,
  reveal,
  delayMs = 0,
  durationMs,
  className,
}: AnimatedCurrencyValueProps) {
  const elRef = useRef<HTMLSpanElement>(null)
  const countedRef = useRef(false)
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    const el = elRef.current
    if (!el) return

    const write = (n: number) => {
      el.textContent = formatCurrency(n)
    }

    if (reveal === 'prep') {
      write(0)
      return
    }

    if (reveal !== 'play' || prefersReducedMotion() || countedRef.current) {
      write(value)
      return
    }

    countedRef.current = true
    const from = 0
    const duration =
      durationMs ??
      (financeIsMobileViewport() ? FINANCE_COUNT_MS_MOBILE : FINANCE_COUNT_MS)
    const delay = Math.max(0, delayMs)
    const wallStart = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const target = valueRef.current
      const elapsed = now - wallStart - delay
      if (elapsed < 0) {
        write(from)
        raf = window.requestAnimationFrame(tick)
        return
      }
      const t = Math.min(1, elapsed / duration)
      const current = Math.round(from + (target - from) * financeSmoothstep(t))
      write(current)
      if (t < 1) {
        raf = window.requestAnimationFrame(tick)
      } else {
        write(target)
      }
    }

    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [reveal, value, delayMs, durationMs])

  return (
    <span className={className} data-finance-animated-currency>
      <span ref={elRef} aria-hidden="true">
        {formatCurrency(reveal === 'prep' ? 0 : value)}
      </span>
      <span className={styles.srOnly}>{formatCurrency(value)}</span>
    </span>
  )
}

export { FINANCE_COUNT_MS as FINANCE_CURRENCY_COUNT_MS }
