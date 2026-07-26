import { useEffect, useRef, useState } from 'react'

export type StageDefinition = {
  id: string
  label: string
}

/**
 * Presentational staged progress. Never marks complete before `pipelineDone`.
 * When the backend finishes early, remaining stages advance quickly (~300–500ms total).
 */
export function useSequentialStages(input: {
  stages: readonly StageDefinition[]
  active: boolean
  pipelineDone: boolean
  stageMs?: number
  fastMs?: number
  readyHoldMs?: number
  onComplete?: () => void
}) {
  const {
    stages,
    active,
    pipelineDone,
    stageMs = 720,
    fastMs = 280,
    readyHoldMs = 380,
    onComplete,
  } = input

  const [index, setIndex] = useState(0)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (!active) {
      setIndex(0)
      completedRef.current = false
    }
  }, [active])

  useEffect(() => {
    if (!active || stages.length === 0) return

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const lastWorking = Math.max(0, stages.length - 2)
    const last = stages.length - 1

    if (!pipelineDone && index >= lastWorking) {
      return
    }

    if (index >= last) {
      if (completedRef.current) return
      const hold = window.setTimeout(
        () => {
          if (completedRef.current) return
          completedRef.current = true
          onCompleteRef.current?.()
        },
        reducedMotion ? 40 : readyHoldMs,
      )
      return () => window.clearTimeout(hold)
    }

    const ms = reducedMotion ? 60 : pipelineDone ? fastMs : stageMs
    const timer = window.setTimeout(() => {
      setIndex((i) => Math.min(i + 1, last))
    }, ms)

    return () => window.clearTimeout(timer)
  }, [
    active,
    stages.length,
    index,
    pipelineDone,
    stageMs,
    fastMs,
    readyHoldMs,
  ])

  return {
    index,
    current: stages[Math.min(index, stages.length - 1)] ?? null,
    isComplete: index >= stages.length - 1 && pipelineDone,
  }
}
