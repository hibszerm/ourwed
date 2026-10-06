import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  isOptionBProgressStage,
  shouldAcceptProgressRow,
  type OptionBProgressRow,
  type OptionBProgressStage,
} from './generationProgress'

const VISIBLE_POLL_MS = 2_000
const HIDDEN_POLL_MS = 5_000

export function useOptionBGenerationProgress(active: boolean, requestId: string | undefined, attempt: number) {
  const [stageState, setStageState] = useState<{ attempt: number; stage: OptionBProgressStage }>({ attempt, stage: 'preparing' })
  const [clockState, setClockState] = useState<{ attempt: number; elapsedMs: number; stageElapsedMs: number }>({ attempt, elapsedMs: 0, stageElapsedMs: 0 })
  const stage = stageState.attempt === attempt ? stageState.stage : 'preparing'
  const elapsedMs = clockState.attempt === attempt ? clockState.elapsedMs : 0
  const stageElapsedMs = clockState.attempt === attempt ? clockState.stageElapsedMs : 0
  const startedAtRef = useRef(0)
  const stageStartedAtRef = useRef(0)
  const stageRef = useRef<OptionBProgressStage>('preparing')

  const setStage = useCallback((next: OptionBProgressStage, updatedAt?: string | null) => {
    const order: OptionBProgressStage[] = ['preparing', 'analyzing', 'building_document', 'verifying', 'preparing_preview']
    if (order.indexOf(next) < order.indexOf(stageRef.current)) return
    if (next !== stageRef.current) {
      stageRef.current = next
      const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN
      const stageAge = Number.isFinite(updatedAtMs) ? Math.max(0, Date.now() - updatedAtMs) : 0
      stageStartedAtRef.current = performance.now() - stageAge
      setStageState({ attempt, stage: next })
    }
  }, [attempt])

  useEffect(() => {
    if (!active || !requestId) return
    let disposed = false
    let polling = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const startedAtWall = Date.now()
    startedAtRef.current = performance.now()
    stageStartedAtRef.current = startedAtRef.current
    stageRef.current = 'preparing'

    const timer = setInterval(() => {
      const now = performance.now()
      setClockState({ attempt, elapsedMs: now - startedAtRef.current, stageElapsedMs: now - stageStartedAtRef.current })
    }, 1_000)

    const schedule = () => {
      if (disposed) return
      timeout = setTimeout(() => void poll(), document.visibilityState === 'hidden' ? HIDDEN_POLL_MS : VISIBLE_POLL_MS)
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
          setStage(data.progress_stage, data.updated_at)
        }
      } catch {
        // Progress polling is presentation-only; the authenticated Edge response owns the result.
      } finally {
        polling = false
        schedule()
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
    }
    // attempt intentionally resets timer/poll scope when MissingInput continuation begins.
  }, [active, requestId, attempt, setStage])

  return { stage, elapsedMs, stageElapsedMs, setStage }
}
