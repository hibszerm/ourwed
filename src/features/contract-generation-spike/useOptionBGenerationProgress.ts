import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  highestVisibleProgressStage,
  isOptionBProgressStage,
  pauseActiveProcessing,
  readActiveProcessing,
  shouldAcceptProgressRow,
  startActiveProcessing,
  type ActiveProcessingClock,
  type OptionBProgressRow,
  type OptionBProgressStage,
} from './generationProgress'

const VISIBLE_POLL_MS = 2_000
const HIDDEN_POLL_MS = 5_000

type ProgressState = {
  generation: number
  stage: OptionBProgressStage
  stageElapsedMs: number
  continuationPreparing: boolean
}

export function useOptionBGenerationProgress(
  active: boolean,
  requestId: string | undefined,
  requestAttempt: number,
  generation: number,
) {
  const [progressState, setProgressState] = useState<ProgressState>({
    generation,
    stage: 'preparing',
    stageElapsedMs: 0,
    continuationPreparing: false,
  })
  const [elapsedState, setElapsedState] = useState({ generation, elapsedMs: 0 })
  const generationRef = useRef(generation)
  const mountedRef = useRef(false)
  const highestStageRef = useRef<OptionBProgressStage>('preparing')
  const backendStageRef = useRef<OptionBProgressStage>('preparing')
  const continuationPreparingRef = useRef(false)
  const processingClockRef = useRef<ActiveProcessingClock>({ accumulatedMs: 0, activeSinceMs: null })
  const stageStartedAtRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const resetGeneration = useCallback(() => {
    generationRef.current = generation
    highestStageRef.current = 'preparing'
    backendStageRef.current = 'preparing'
    continuationPreparingRef.current = false
    processingClockRef.current = { accumulatedMs: 0, activeSinceMs: null }
    stageStartedAtRef.current = 0
    setProgressState({ generation, stage: 'preparing', stageElapsedMs: 0, continuationPreparing: false })
    setElapsedState({ generation, elapsedMs: 0 })
  }, [generation])

  useEffect(() => {
    if (generationRef.current === generation) return
    resetGeneration()
  }, [generation, resetGeneration])

  const beginContinuation = useCallback(() => {
    const preservedStage = highestStageRef.current
    if (preservedStage === 'preparing') return
    continuationPreparingRef.current = true
    setProgressState({
      generation,
      stage: preservedStage,
      stageElapsedMs: 0,
      continuationPreparing: preservedStage === 'analyzing',
    })
  }, [generation])

  const setVisibleStage = useCallback((next: OptionBProgressStage) => {
    const stage = highestVisibleProgressStage(highestStageRef.current, next)
    highestStageRef.current = stage
    continuationPreparingRef.current = false
    setProgressState({ generation, stage, stageElapsedMs: 0, continuationPreparing: false })
  }, [generation])

  useEffect(() => {
    if (!active || !requestId) return
    let disposed = false
    let polling = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const startedAtWall = Date.now()
    const startedAt = performance.now()
    processingClockRef.current = startActiveProcessing(processingClockRef.current, startedAt)
    backendStageRef.current = 'preparing'

    const updateClock = () => {
      const now = performance.now()
      setElapsedState({ generation, elapsedMs: readActiveProcessing(processingClockRef.current, now) })
      setProgressState((current) => {
        if (current.generation !== generation || current.stage === 'preparing') return current
        return { ...current, stageElapsedMs: Math.max(0, now - stageStartedAtRef.current) }
      })
    }
    const timer = setInterval(updateClock, 1_000)

    const setObservedStage = (next: OptionBProgressStage, updatedAt?: string | null) => {
      if (next === 'preparing') {
        backendStageRef.current = next
        if (highestStageRef.current !== 'preparing') {
          continuationPreparingRef.current = highestStageRef.current === 'analyzing'
          setProgressState({
            generation,
            stage: highestStageRef.current,
            stageElapsedMs: 0,
            continuationPreparing: continuationPreparingRef.current,
          })
        } else {
          setVisibleStage('preparing')
        }
        return
      }

      const isNewBackendStage = next !== backendStageRef.current
      backendStageRef.current = next
      const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN
      const stageAge = Number.isFinite(updatedAtMs) ? Math.max(0, Date.now() - updatedAtMs) : 0
      if (isNewBackendStage) {
        stageStartedAtRef.current = performance.now() - stageAge
      }
      const stage = highestVisibleProgressStage(highestStageRef.current, next)
      highestStageRef.current = stage
      continuationPreparingRef.current = false
      setProgressState((current) => ({
        generation,
        stage,
        stageElapsedMs: isNewBackendStage
          ? stageAge
          : current.generation === generation ? current.stageElapsedMs : 0,
        continuationPreparing: false,
      }))
    }

    const poll = async () => {
      if (disposed || polling) return
      polling = true
      try {
        const { data, error } = await supabase
          .from('wedding_contract_generation_runs')
          .select('session_state,generation_status,progress_stage,updated_at')
          .eq('session_kind', 'option_b')
          .eq('idempotency_key', requestId)
          .maybeSingle()
        if (!error && data && shouldAcceptProgressRow(data as OptionBProgressRow, startedAtWall - 5_000)
          && isOptionBProgressStage(data.progress_stage)) {
          const updatedAt = data.updated_at ? Date.parse(data.updated_at) : Number.NaN
          if (continuationPreparingRef.current && data.progress_stage === 'analyzing'
            && Number.isFinite(updatedAt) && updatedAt < startedAtWall - 1_000) return
          setObservedStage(data.progress_stage, data.updated_at)
        }
      } catch {
        // Progress polling is presentation-only; the authenticated Edge response owns the result.
      } finally {
        polling = false
        if (!disposed) {
          timeout = setTimeout(() => void poll(), document.visibilityState === 'hidden' ? HIDDEN_POLL_MS : VISIBLE_POLL_MS)
        }
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || disposed) return
      if (timeout) clearTimeout(timeout)
      void poll()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    void poll()
    return () => {
      disposed = true
      clearInterval(timer)
      if (timeout) clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      processingClockRef.current = pauseActiveProcessing(processingClockRef.current, performance.now())
      if (mountedRef.current) {
        setElapsedState({ generation, elapsedMs: readActiveProcessing(processingClockRef.current, performance.now()) })
      }
    }
  }, [active, requestId, requestAttempt, generation, setVisibleStage])

  return {
    stage: progressState.generation === generation ? progressState.stage : 'preparing',
    elapsedMs: elapsedState.generation === generation ? elapsedState.elapsedMs : 0,
    stageElapsedMs: progressState.generation === generation ? progressState.stageElapsedMs : 0,
    continuationPreparing: progressState.generation === generation && progressState.continuationPreparing,
    beginContinuation,
    setStage: setVisibleStage,
  }
}
