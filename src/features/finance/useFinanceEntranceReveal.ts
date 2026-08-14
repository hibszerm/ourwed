import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { FINANCE_ENTRANCE_DONE_MS } from '@/features/finance/financeMotion'

export type FinanceRevealPhase = 'off' | 'prep' | 'play' | 'done'

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', onStoreChange)
  return () => mq.removeEventListener('change', onStoreChange)
}

function getReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface FinanceEntranceReveal {
  phase: FinanceRevealPhase
  /**
   * Snap entrance to final immediately (month click, leave Sezon tab, etc.).
   * Prevents remounted chart from replaying CSS bar rise mid-visit.
   */
  completeEntrance: () => void
  /** True after entrance has started or completed — chart CSS must not re-arm. */
  entranceLocked: boolean
}

/**
 * Page-entry reveal for Finance — once per FinancePage mount (route visit)
 * when data is ready. Does NOT replay on month / kind / health / refetch /
 * Sezon↔Zlecenia remounts.
 *
 * First data-ready render is `prep` (derived, before paint) so KPI/chart never
 * flash finals — including warm React Query cache on route re-entry.
 *
 * Strict Mode safe: do not permanently consume the visit until play actually
 * starts (or completeEntrance). Premature `started=true` before rAF caused
 * warm remounts to skip entrance after effect cleanup cancelled the rAF.
 *
 * Animation-tax rule: play starts on the next frames after dataReady — no
 * artificial wait.
 */
export function useFinanceEntranceReveal(
  dataReady: boolean,
): FinanceEntranceReveal {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  )
  /** Once play/complete has begun for this FinancePage mount — survives dataReady flicker. */
  const entranceConsumed = useRef(false)
  const [play, setPlay] = useState(false)
  const [done, setDone] = useState(false)
  const [entranceLocked, setEntranceLocked] = useState(false)

  const completeEntrance = useCallback(() => {
    entranceConsumed.current = true
    setPlay(true)
    setDone(true)
    setEntranceLocked(true)
  }, [])

  useEffect(() => {
    if (!dataReady || reduced) return
    if (entranceConsumed.current) return

    let cancelled = false

    let raf2 = 0
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (cancelled) return
        entranceConsumed.current = true
        setEntranceLocked(true)
        setPlay(true)
      })
    })

    const doneTimer = window.setTimeout(() => {
      if (cancelled) return
      entranceConsumed.current = true
      setDone(true)
    }, FINANCE_ENTRANCE_DONE_MS)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      window.clearTimeout(doneTimer)
      // Do not set entranceConsumed here — allow Strict Mode / aborted start to retry.
    }
  }, [dataReady, reduced])

  if (!dataReady) {
    return { phase: 'off', completeEntrance, entranceLocked }
  }
  if (reduced || done) {
    return { phase: 'done', completeEntrance, entranceLocked: reduced || entranceLocked }
  }
  if (play) {
    return { phase: 'play', completeEntrance, entranceLocked }
  }
  return { phase: 'prep', completeEntrance, entranceLocked }
}
