import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ASSISTANT_API_FAILURE,
} from './copy'
import {
  AssistantContext,
  type AssistantContextValue,
} from './assistantContext'
import {
  appendImmediatePendingUser,
  completePendingUserWithApiFailure,
  completePendingUserWithPresentation,
  destroyV7Session,
  isV7Enabled,
  isV7GlobalFlagEnabled,
  runV7Turn,
  setV7SessionOpen,
  beginV7LatencyTrace,
  clearActiveV7LatencyTrace,
  type TranscriptEntry,
} from './v7'
import { authService } from '@/features/auth/services/authService'
import {
  AssistantMobileLauncher,
  AssistantSidebarLauncher,
} from './components/AssistantLauncher'
import {
  AssistantSurface,
  type AssistantTurn,
} from './components/AssistantSurface'

function createTurnId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return Boolean(target.closest('[contenteditable="true"]'))
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  /** Legacy turns slot — unused by Golden V7 (presentation transcript only). */
  const [turns] = useState<AssistantTurn[]>([])
  /** V7 presentation transcript — ephemeral memory only; never fed into V7. */
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [loading, setLoading] = useState(false)
  const currentTurnIdRef = useRef<string | null>(null)
  const openRef = useRef(false)
  const recentUtterancesRef = useRef<string[]>([])
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const clearSession = useCallback(() => {
    setTranscript([])
    setLoading(false)
    recentUtterancesRef.current = []
    currentTurnIdRef.current = null
    setV7SessionOpen(false)
    destroyV7Session()
  }, [])

  const closeAssistant = useCallback(() => {
    openRef.current = false
    setOpen(false)
    clearSession()
  }, [clearSession])

  const openAssistant = useCallback(() => {
    openRef.current = true
    setOpen(true)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== 'k') return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      setOpen((prev) => {
        if (prev) {
          openRef.current = false
          clearSession()
          return false
        }
        openRef.current = true
        return true
      })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [clearSession])

  const runQuery = useCallback(
    async (userText: string) => {
      const id = createTurnId()
      currentTurnIdRef.current = id
      setLoading(true)

      const latencyTrace = beginV7LatencyTrace(id)

      const optimisticV7WorkingState = isV7GlobalFlagEnabled()
      if (optimisticV7WorkingState) {
        setTranscript((prev) => appendImmediatePendingUser(prev, id, userText))
        latencyTrace?.mark('working_state_visible')
      }

      const canaryUser = await authService.getUser().catch(() => null)
      const authUserId = canaryUser?.id ?? null
      latencyTrace?.mark('auth_ready')

      // Golden V7 — sole customer-visible Assistant engine.
      if (isV7Enabled(authUserId)) {
        setV7SessionOpen(true)
        if (!optimisticV7WorkingState) {
          setTranscript((prev) =>
            appendImmediatePendingUser(prev, id, userText),
          )
          latencyTrace?.mark('working_state_visible')
        }
        try {
          const { result, presentation } = await runV7Turn({
            turnId: id,
            utterance: userText,
          })
          latencyTrace?.mark('frontend_received', {
            ok: result.ok,
            stoppedReason: result.stoppedReason,
          })
          if (!openRef.current) {
            clearActiveV7LatencyTrace()
            return
          }
          if (currentTurnIdRef.current !== id) {
            clearActiveV7LatencyTrace()
            return
          }
          recentUtterancesRef.current = [
            ...recentUtterancesRef.current,
            userText.trim(),
          ].slice(-4)
          setTranscript((prev) =>
            completePendingUserWithPresentation(prev, id, presentation),
          )
          latencyTrace?.mark('ui_visible')
          latencyTrace?.finish({
            ok: result.ok,
            stoppedReason: result.stoppedReason,
            model: result.model,
            toolCallCount: result.toolCallCount,
            toolNames: result.toolCalls.map((t) => t.name),
            llmCallCount:
              (result.latency.firstModelMs != null ? 1 : 0) +
              result.latency.subsequentModelMs.length,
          })
        } catch {
          latencyTrace?.mark('frontend_error')
          latencyTrace?.finish({ ok: false, stoppedReason: 'frontend_error' })
          if (!openRef.current) return
          if (currentTurnIdRef.current !== id) return
          setTranscript((prev) =>
            completePendingUserWithApiFailure(
              prev,
              id,
              userText,
              ASSISTANT_API_FAILURE,
            ),
          )
        } finally {
          setLoading(false)
        }
        return
      }

      // Authenticated without V7 (or unauthenticated) → fail closed.
      clearActiveV7LatencyTrace()
      if (!openRef.current) {
        setLoading(false)
        return
      }
      if (currentTurnIdRef.current !== id) {
        setLoading(false)
        return
      }
      setTranscript((prev) =>
        completePendingUserWithApiFailure(
          prev,
          id,
          userText,
          ASSISTANT_API_FAILURE,
        ),
      )
      setLoading(false)
    },
    [],
  )

  const value = useMemo<AssistantContextValue>(
    () => ({
      open,
      openAssistant,
      closeAssistant,
      MobileLauncher: () => (
        <AssistantMobileLauncher onOpen={openAssistant} />
      ),
      SidebarLauncher: () => (
        <AssistantSidebarLauncher onOpen={openAssistant} active={open} />
      ),
    }),
    [open, openAssistant, closeAssistant],
  )

  const noop = useCallback(() => {}, [])
  const noopChoice = useCallback((..._args: [string, 'wedding' | 'session']) => {
    void _args
  }, [])

  return (
    <AssistantContext.Provider value={value}>
      {children}
      <AssistantSurface
        open={open}
        isMobile={isMobile}
        turns={turns}
        transcript={transcript}
        loading={loading}
        confirming={false}
        contextHeader={null}
        showChangeWedding={false}
        onClose={closeAssistant}
        onSubmit={(text) => void runQuery(text)}
        onSelectChoice={noopChoice}
        onSelectClarification={noop}
        onChangeWedding={noop}
        onConfirmCreateWedding={noop}
        onConfirmCreateTask={noop}
        onNavigate={(path) => {
          navigate(path)
          closeAssistant()
        }}
        onCancelConfirm={noop}
      />
    </AssistantContext.Provider>
  )
}
