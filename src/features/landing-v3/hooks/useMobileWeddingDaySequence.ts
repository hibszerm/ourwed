import { useEffect, useRef, useState } from 'react'
import {
  cycleDuration,
  REDUCED_MOTION_SNAPSHOT,
  snapshotAtTime,
  type MobileDemoSnapshot,
} from '@/features/landing-v3/motion/mobileWeddingDaySequence'

const IDLE_SNAPSHOT: MobileDemoSnapshot = {
  phase: 'settle',
  focus: 'none',
  phonesEntered: false,
  chooserProgress: 0,
  navigationProgress: 0,
  routeProgress: 0,
  navStatus: 'opening',
  assignmentDimmed: false,
  briefProgress: 0,
  progress: 0,
}

/**
 * One-shot RAF controller. Plays once per page session.
 * Ends on persistent brief state. No loop / no scroll reset.
 */
export function useMobileWeddingDaySequence(options: {
  active: boolean
  reduced: boolean
  mode: 'full' | 'simple'
  /** Fast-scroll past phones — land on final brief immediately. */
  forceFinal?: boolean
}) {
  const { active, reduced, mode, forceFinal = false } = options
  const [snapshot, setSnapshot] = useState<MobileDemoSnapshot>(() =>
    reduced || forceFinal ? REDUCED_MOTION_SNAPSHOT : IDLE_SNAPSHOT,
  )

  const elapsedRef = useRef(0)
  const lastTsRef = useRef<number | null>(null)
  const completedRef = useRef(false)
  const startedRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (reduced || forceFinal) {
      completedRef.current = true
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      return
    }
    if (!active) return
    if (completedRef.current) return

    startedRef.current = true
    lastTsRef.current = null

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = Math.min(0.064, (ts - lastTsRef.current) / 1000)
      lastTsRef.current = ts

      const duration = cycleDuration(mode)
      elapsedRef.current = Math.min(duration, elapsedRef.current + dt)
      setSnapshot(snapshotAtTime(elapsedRef.current, mode))

      if (elapsedRef.current >= duration) {
        completedRef.current = true
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    // Kick first frame immediately so settle→phonesEntered is not stuck if RAF is delayed.
    setSnapshot(snapshotAtTime(Math.max(elapsedRef.current, 0.08), mode))
    elapsedRef.current = Math.max(elapsedRef.current, 0.08)
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
    }
  }, [active, reduced, mode, forceFinal])

  if (reduced || forceFinal) return REDUCED_MOTION_SNAPSHOT
  return snapshot
}
