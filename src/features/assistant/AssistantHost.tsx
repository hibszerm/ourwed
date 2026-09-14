import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateWedding } from '@/features/weddings/hooks/useCreateWedding'
import { taskService } from '@/lib/api/taskService'
import { invalidateTaskDomain } from '@/features/tasks/invalidateTaskDomain'
import {
  buildCreateWeddingInput,
  runAssistantQuery,
} from './api/assistantApi'
import { weddingIdFromResponse } from './api/executeSemantic'
import { withResolvedWedding } from './api/semantic'
import { executeAssistantTool } from './tools/executeTool'
import {
  ASSISTANT_API_FAILURE,
  ASSISTANT_CLARIFICATION_DEAD_OPTION,
  ASSISTANT_CLARIFICATION_STALE,
} from './copy'
import { formatPolishLongDate } from './dates'
import {
  applyWorkingContextPatch,
  emptyWorkingContext,
  type AssistantWorkingContext,
} from './api/workingContext'
import {
  AssistantContext,
  type AssistantContextValue,
} from './assistantContext'
import {
  clearAssistantV4ShadowSessionAndPending,
  completeAssistantV4FinanceShadowComparison,
  runAssistantV4Shadow,
  semanticContextFromWorkingHints,
} from './v4/shadow'
import {
  clearPendingGoalClarificationOnly,
  getPendingGoalClarification,
} from './v4/goalSpec/goalClarificationSession'
import { destroyGoalClarificationOnAssistantClose } from './v4/goalSpec/resumeGoalClarification'
import {
  goalClarificationToAssistantResponse,
  isGoalClarificationHostEnabled,
  submitGoalClarificationAnswerWithLabel,
} from './v4/goalSpec/goalClarificationHostAdapter'
import { clarificationLabelCopy } from './v4/goalSpec/goalClarificationCopy'
import {
  invalidateV5GoalShadowTurn,
  runV5GoalSpecShadow,
  runV5GoalSpecShadowAsync,
  setV5GoalShadowSessionOpen,
  type V5GoalShadowResult,
} from './v4/goalSpec/v5GoalSpecShadow'
import {
  invalidateV6ShadowTurn,
  runV6AssistantShadow,
  setV6ShadowSessionOpen,
} from './v6'
import { executeDomainQueryShadow } from './v4/domainQuery/executeDomainQuery'
import { assessSemanticCoverage } from './v4/goalSpec/semanticCoverage'
import {
  buildAuthorityDiagnostic,
  decideAssistantAuthority,
  emitAssistantAuthorityDiagnostic,
  fetchAssistantRuntimeConfig,
  getCanaryEligible,
  getEffectiveAssistantMode,
  isIc1CanaryDomainQueryEligible,
  isV5OwnershipPathEnabled,
  isV5ShadowDiagnosticsEnabled,
  renderDomainQueryObservation,
  resolveEffectiveAssistantMode,
  setCanaryEligibleFromRuntime,
  setEffectiveAssistantMode,
} from './v4/authority'
import type { DomainQueryStatusKind } from './v4/authority/types'
import type {
  AssistantResponse,
  AssistantSemanticRequest,
  PageContextHint,
  PreparedCreateTaskDto,
  PreparedCreateWeddingDto,
} from './types'
import {
  AssistantMobileLauncher,
  AssistantSidebarLauncher,
} from './components/AssistantLauncher'
import {
  AssistantSurface,
  type AssistantTurn,
} from './components/AssistantSurface'

function formatPolishLongDateSafe(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatPolishLongDate(raw)
  return raw
}

function createTurnId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parsePageContext(pathname: string): PageContextHint | null {
  const wedding = pathname.match(/^\/sluby\/([0-9a-f-]{36})/i)
  if (wedding) {
    return { resourceType: 'wedding', resourceId: wedding[1]! }
  }
  const session = pathname.match(/^\/sesje\/([0-9a-f-]{36})/i)
  if (session) {
    return { resourceType: 'session', resourceId: session[1]! }
  }
  return null
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return Boolean(target.closest('[contenteditable="true"]'))
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createWedding = useCreateWedding()

  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<AssistantTurn[]>([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [preparedWedding, setPreparedWedding] =
    useState<PreparedCreateWeddingDto | null>(null)
  const [preparedTask, setPreparedTask] =
    useState<PreparedCreateTaskDto | null>(null)
  /** Ephemeral — cleared when Assistant closes. */
  const [sessionWeddingId, setSessionWeddingId] = useState<string | null>(null)
  const [workingContext, setWorkingContext] = useState<AssistantWorkingContext>(
    () => emptyWorkingContext(),
  )
  const [contextHeader, setContextHeader] = useState<{
    title: string
    subtitle: string | null
  } | null>(null)
  /** Last ambiguity list — for quiet "Zmień". */
  const [lastChoice, setLastChoice] = useState<AssistantResponse | null>(null)
  /** U3: presentation-only resolved GoalSpec clarification label. */
  const [goalClarificationResolvedLabel, setGoalClarificationResolvedLabel] =
    useState<string | null>(null)
  /**
   * U4 DEV/shadow: V5 GoalSpec clarification coexists with V3 answer.
   * Never replaces production response.
   */
  const [v5ShadowClarification, setV5ShadowClarification] = useState<{
    turnId: string
    response: Extract<AssistantResponse, { kind: 'clarification' }>
  } | null>(null)
  const [v5ShadowResumeNote, setV5ShadowResumeNote] = useState<string | null>(
    null,
  )
  const currentTurnIdRef = useRef<string | null>(null)
  const openRef = useRef(false)
  const recentUtterancesRef = useRef<string[]>([])
  const resolvingClarificationIdRef = useRef<string | null>(null)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false,
  )

  const pageContext = useMemo(
    () => parsePageContext(location.pathname),
    [location.pathname],
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const clearSession = useCallback(() => {
    setTurns([])
    setLoading(false)
    setConfirming(false)
    setPreparedWedding(null)
    setPreparedTask(null)
    setSessionWeddingId(null)
    setWorkingContext(emptyWorkingContext())
    setContextHeader(null)
    setLastChoice(null)
    setGoalClarificationResolvedLabel(null)
    setV5ShadowClarification(null)
    setV5ShadowResumeNote(null)
    recentUtterancesRef.current = []
    resolvingClarificationIdRef.current = null
    currentTurnIdRef.current = null
    clearAssistantV4ShadowSessionAndPending()
    // IC1: wipe V5 semantic SoT (active DomainQuery + pending clarification).
    invalidateV5GoalShadowTurn({ wipeAll: true, reason: 'assistant_close' })
    destroyGoalClarificationOnAssistantClose()
    setV5GoalShadowSessionOpen(false)
    invalidateV6ShadowTurn({ wipeAll: true, reason: 'assistant_close' })
    setV6ShadowSessionOpen(false)
  }, [])

  const closeAssistant = useCallback(() => {
    openRef.current = false
    setOpen(false)
    clearSession()
  }, [clearSession])

  const refreshAssistantRuntime = useCallback(async () => {
    const cfg = await fetchAssistantRuntimeConfig()
    const effective = resolveEffectiveAssistantMode({ runtimeMode: cfg.mode })
    setEffectiveAssistantMode(effective)
    setCanaryEligibleFromRuntime(cfg.canaryEligible)
    setV5GoalShadowSessionOpen(isV5ShadowDiagnosticsEnabled())
    // V6-F1: always shadow diagnostics when Assistant opens (never visible authority).
    setV6ShadowSessionOpen(true)
    return cfg
  }, [])

  const openAssistant = useCallback(() => {
    openRef.current = true
    void refreshAssistantRuntime()
    setOpen(true)
  }, [refreshAssistantRuntime])

  const recordV5AuthorityDecision = useCallback(
    (
      shadow: V5GoalShadowResult,
      domainQueryStatusOverride?: DomainQueryStatusKind,
    ) => {
      const requestKind =
        shadow.status === 'bound' || shadow.status === 'needs_clarification'
          ? shadow.goalSpec.requestKind
          : (shadow.diagnostic.requestKind ?? null)

      let interpreterStatus:
        | 'ok'
        | 'schema_error'
        | 'provider_error'
        | 'invoke_error'
        | 'skipped'
        | 'unsupported'
        | null = 'ok'
      if (shadow.status === 'interpret_error') {
        const code = shadow.diagnostic.outcomeCode
        interpreterStatus =
          code === 'interpreter_schema_error'
            ? 'schema_error'
            : code === 'interpreter_provider_error'
              ? 'provider_error'
              : 'invoke_error'
      } else if (shadow.status === 'skipped') {
        interpreterStatus = 'skipped'
      } else if (shadow.status === 'unsupported') {
        interpreterStatus =
          requestKind === 'unsupported' ? 'unsupported' : 'ok'
      }

      const resolverOutcome =
        shadow.status === 'bound'
          ? ('bound' as const)
          : shadow.status === 'needs_clarification'
            ? ('needs_clarification' as const)
            : shadow.status === 'unsupported'
              ? ('unsupported' as const)
              : shadow.status === 'interpret_error'
                ? ('interpret_error' as const)
                : shadow.status === 'discarded'
                  ? ('discarded' as const)
                  : ('skipped' as const)

      let domainQueryStatus: DomainQueryStatusKind =
        domainQueryStatusOverride ?? 'not_attempted'
      if (!domainQueryStatusOverride && shadow.status === 'bound') {
        domainQueryStatus = isIc1CanaryDomainQueryEligible(shadow.query)
          ? 'valid'
          : 'slice_ineligible'
      }

      let semanticCoverageStatus:
        | 'complete'
        | 'incomplete'
        | 'not_assessed' = 'not_assessed'
      let semanticCoverageReasons: string[] | undefined
      if (shadow.status === 'bound') {
        const coverage = assessSemanticCoverage({
          goalSpec: shadow.goalSpec,
          boundGoal: shadow.bound,
          domainQuery: shadow.query,
        })
        semanticCoverageStatus = coverage.status
        if (coverage.status === 'incomplete') {
          semanticCoverageReasons = coverage.reasonCodes
        }
      }

      const canaryEligible = getCanaryEligible()
      const decision = decideAssistantAuthority({
        effectiveMode: getEffectiveAssistantMode(),
        requestKind,
        interpreterStatus,
        resolverOutcome,
        clarificationSlot:
          shadow.status === 'needs_clarification'
            ? shadow.request.slot
            : null,
        domainQueryStatus,
        canaryEligible,
        semanticCoverageStatus,
        semanticCoverageReasons,
        writeAttemptOnReadPath: requestKind === 'prepare_action',
      })

      emitAssistantAuthorityDiagnostic(
        buildAuthorityDiagnostic({
          turnId: shadow.turnId,
          decision,
          effectiveMode: getEffectiveAssistantMode(),
          interpreterStatus,
          resolverOutcome,
          domainQueryStatus,
          canaryEligible,
          semanticCoverageStatus,
          semanticCoverageReasons,
          latencyMs: shadow.diagnostic.latencyMs,
          outcomeCode: shadow.diagnostic.outcomeCode,
        }),
      )

      return decision
    },
    [],
  )

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
        void refreshAssistantRuntime()
        return true
      })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [clearSession, refreshAssistantRuntime])

  const applyResponse = useCallback((response: AssistantResponse) => {
    if (response.kind === 'confirmation' && response.action === 'create_wedding') {
      setPreparedWedding(response.prepared)
      setPreparedTask(null)
    } else if (
      response.kind === 'confirmation' &&
      response.action === 'create_task'
    ) {
      setPreparedTask(response.prepared)
      setPreparedWedding(null)
    } else {
      setPreparedWedding(null)
      setPreparedTask(null)
    }

    if (response.kind === 'choice') {
      setLastChoice(response)
    }

    const wid = weddingIdFromResponse(response)
    if (wid) setSessionWeddingId(wid)

    // Presentation context header — once per resolved resource
    if (response.kind === 'finance') {
      setContextHeader({
        title: response.finance.displayName,
        subtitle: response.finance.date
          ? formatPolishLongDateSafe(response.finance.date)
          : null,
      })
    } else if (
      response.kind === 'places' ||
      response.kind === 'day_plan' ||
      response.kind === 'next_action' ||
      response.kind === 'wedding'
    ) {
      setContextHeader({
        title: response.wedding.displayName,
        subtitle: response.wedding.date
          ? formatPolishLongDateSafe(response.wedding.date)
          : null,
      })
    } else if (response.kind === 'tasks' && response.wedding) {
      setContextHeader({
        title: response.wedding.displayName,
        subtitle: response.wedding.date
          ? formatPolishLongDateSafe(response.wedding.date)
          : null,
      })
    } else if (response.kind === 'session') {
      setContextHeader({
        title: response.session.displayName,
        subtitle: response.session.date
          ? formatPolishLongDateSafe(response.session.date)
          : null,
      })
    } else if (response.kind === 'choice') {
      // Keep prior context; choice is ambiguity
    }
  }, [])

  const replaceLastTurn = useCallback(
    (userText: string, response: AssistantResponse) => {
      applyResponse(response)
      setTurns((prev) => {
        if (prev.length === 0) {
          return [
            {
              id: createTurnId(),
              userText,
              response,
              loading: false,
            },
          ]
        }
        const next = [...prev]
        const last = next[next.length - 1]!
        next[next.length - 1] = {
          ...last,
          userText,
          response,
          loading: false,
        }
        return next
      })
    },
    [applyResponse],
  )

  const appendResponse = useCallback(
    (userText: string, response: AssistantResponse) => {
      applyResponse(response)
      setTurns([
        { id: createTurnId(), userText, response, loading: false },
      ])
    },
    [applyResponse],
  )

  const runQuery = useCallback(
    async (userText: string) => {
      const id = createTurnId()
      currentTurnIdRef.current = id
      // Presentation: replace prior answer — do not stack a transcript
      setTurns([{ id, userText, response: null, loading: true }])
      setLoading(true)
      setGoalClarificationResolvedLabel(null)
      setV5ShadowClarification(null)
      setV5ShadowResumeNote(null)

      await refreshAssistantRuntime()

      // NL turn supersedes pending GoalSpec clarification chips (stale-safe).
      if (isGoalClarificationHostEnabled()) {
        clearPendingGoalClarificationOnly()
        invalidateV5GoalShadowTurn({ reason: 'new_nl_turn' })
        setV5GoalShadowSessionOpen(true)

        // V6-F1: shadow-only agent diagnostics (isolated SoT; never visible).
        setV6ShadowSessionOpen(true)
        runV6AssistantShadow({
          turnId: id,
          utterance: userText,
          recentUtterances: recentUtterancesRef.current.slice(-6),
        })

        // IC1: allowlisted canary awaits V5 before V3 — one visible owner.
        if (isV5OwnershipPathEnabled()) {
          const shadow = await runV5GoalSpecShadowAsync({
            turnId: id,
            userText,
            pageResourceKind: pageContext?.resourceType ?? null,
          })
          if (!openRef.current) return
          if (currentTurnIdRef.current !== id) return

          let decision = recordV5AuthorityDecision(shadow)

          if (
            decision.kind === 'v5_clarification' &&
            decision.visibleOwner === 'v5' &&
            shadow.status === 'needs_clarification'
          ) {
            const response = goalClarificationToAssistantResponse(
              shadow.request,
            )
            setTurns([{ id, userText, response, loading: false }])
            setLoading(false)
            return
          }

          if (
            decision.kind === 'v5_authority' &&
            decision.visibleOwner === 'v5' &&
            shadow.status === 'bound'
          ) {
            const exec = await executeDomainQueryShadow(shadow.query)
            if (!openRef.current || currentTurnIdRef.current !== id) return
            if (exec.ok) {
              decision = recordV5AuthorityDecision(shadow, 'executed')
              const response = renderDomainQueryObservation(exec.observation)
              applyResponse(response)
              setTurns([{ id, userText, response, loading: false }])
              setLoading(false)
              return
            }
            decision = recordV5AuthorityDecision(
              shadow,
              'execution_unavailable',
            )
            // fall through to V3
          }
          // Typed V3 fallback for unsupported / ineligible / errors
        } else {
          // Shadow diagnostics only (non-allowlisted canary or shadow mode)
          runV5GoalSpecShadow({
            turnId: id,
            userText,
            pageResourceKind: pageContext?.resourceType ?? null,
            onResult: (shadow) => {
              if (!openRef.current) return
              if (currentTurnIdRef.current !== shadow.turnId) return
              recordV5AuthorityDecision(shadow)
              if (
                getEffectiveAssistantMode() === 'shadow' &&
                shadow.status === 'needs_clarification'
              ) {
                const response = goalClarificationToAssistantResponse(
                  shadow.request,
                )
                setV5ShadowClarification({
                  turnId: shadow.turnId,
                  response,
                })
                return
              }
              if (
                getEffectiveAssistantMode() === 'shadow' &&
                shadow.status === 'bound'
              ) {
                setV5ShadowResumeNote(
                  'V5 GoalSpec (shadow): zapytanie związane bez doprecyzowania.',
                )
              }
            },
          })
        }
      }

      // V4 shadow: fire-and-forget. Never blocks / mutates V3 visible path.
      const shadowAbort = new AbortController()
      runAssistantV4Shadow({
        turnId: id,
        userText,
        signal: shadowAbort.signal,
        workingContext,
        pageContext,
        semanticContext: semanticContextFromWorkingHints({
          activeResourceKind: workingContext.activeResource?.kind ?? null,
          pageResourceKind: pageContext?.resourceType ?? null,
          activeParticipantHint:
            workingContext.activeParticipant?.displayLabel ?? null,
          currentTopic:
            workingContext.discourseFocus?.placeScope ??
            workingContext.lastResolvedRequest?.goalType ??
            workingContext.lastDirectContext?.intent ??
            null,
          hasSequenceContext: Boolean(
            workingContext.discourseFocus?.dayPlanStage ||
              workingContext.discourseFocus?.sequenceKind ||
              workingContext.lastResolvedRequest?.goalType === 'day_plan' ||
              workingContext.lastResolvedRequest?.goalType === 'schedule',
          ),
          lastTemporalPhrase: workingContext.temporalAnchor?.phrase ?? null,
        }),
      })

      try {
        const recentUtterances = [...recentUtterancesRef.current]
        const result = await runAssistantQuery({
          userText,
          pageContext,
          sessionContext: { weddingId: sessionWeddingId },
          workingContext,
          recentUtterances,
        })
        recentUtterancesRef.current = [
          ...recentUtterancesRef.current,
          userText.trim(),
        ].slice(-4)
        setWorkingContext((prev) =>
          applyWorkingContextPatch(prev, result.contextPatch),
        )
        if (result.contextPatch.activeResource?.kind === 'wedding') {
          setSessionWeddingId(result.contextPatch.activeResource.id)
        }
        applyResponse(result.response)
        setTurns([{ id, userText, response: result.response, loading: false }])
        // Phase 3A: structured V4↔V3 finance compare (DEV flag). Never blocks UI.
        completeAssistantV4FinanceShadowComparison({
          turnId: id,
          v3Response: result.response,
        })
      } catch {
        shadowAbort.abort()
        setTurns([
          {
            id,
            userText,
            loading: false,
            response: { kind: 'error', message: ASSISTANT_API_FAILURE },
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [
      pageContext,
      sessionWeddingId,
      workingContext,
      applyResponse,
      recordV5AuthorityDecision,
      refreshAssistantRuntime,
    ],
  )

  const continueSemantic = useCallback(
    async (
      semantic: AssistantSemanticRequest,
      label: string,
      mode: 'replace' | 'append' = 'replace',
    ) => {
      setLoading(true)
      setTurns((prev) => {
        const last = prev[prev.length - 1]
        if (!last) {
          return [
            {
              id: createTurnId(),
              userText: label,
              response: null,
              loading: true,
            },
          ]
        }
        return [
          {
            ...last,
            id: createTurnId(),
            userText: label,
            response: null,
            loading: true,
          },
        ]
      })
      try {
        const result = await runAssistantQuery({
          userText: label,
          pageContext,
          sessionContext: { weddingId: sessionWeddingId },
          workingContext,
          semanticRequest: semantic,
        })
        setWorkingContext((prev) =>
          applyWorkingContextPatch(prev, result.contextPatch),
        )
        if (result.contextPatch.activeResource?.kind === 'wedding') {
          setSessionWeddingId(result.contextPatch.activeResource.id)
        }
        if (mode === 'replace') {
          replaceLastTurn(label, result.response)
        } else {
          appendResponse(label, result.response)
        }
      } catch {
        if (mode === 'replace') {
          replaceLastTurn(label, {
            kind: 'error',
            message: ASSISTANT_API_FAILURE,
          })
        } else {
          appendResponse(label, {
            kind: 'error',
            message: ASSISTANT_API_FAILURE,
          })
        }
      } finally {
        setLoading(false)
      }
    },
    [
      pageContext,
      sessionWeddingId,
      workingContext,
      replaceLastTurn,
      appendResponse,
    ],
  )

  const onSelectChoice = useCallback(
    async (itemId: string, kind: 'wedding' | 'session') => {
      const last = turns[turns.length - 1]
      const choice =
        last?.response?.kind === 'choice' ? last.response : null

      // Year disambiguation for create-wedding
      if (choice?.pendingQuery && /^\d{4}-\d{2}-\d{2}$/.test(itemId)) {
        const pending = choice.pendingQuery
        const partners = pending.match(
          /(?:stwórz|stworz|dodaj)\s+ślub\s+\S+\s+(.+?)\s+i\s+(.+)/i,
        )
        if (partners) {
          setLoading(true)
          try {
            const prepared = await executeAssistantTool({
              name: 'prepare_create_wedding',
              args: {
                date: itemId,
                partner1: partners[1]!.trim(),
                partner2: partners[2]!.trim(),
              },
            })
            const d = prepared.data as Record<string, unknown> | null
            if (prepared.ok && d?.prepared) {
              replaceLastTurn(pending, {
                kind: 'confirmation',
                action: 'create_wedding',
                prepared: {
                  partner1: String(d.partner1),
                  partner2: String(d.partner2),
                  date: String(d.date),
                  displayLabel: String(d.displayLabel),
                  dateLabel: String(d.dateLabel),
                  duplicates: Array.isArray(d.duplicates)
                    ? (d.duplicates as never)
                    : [],
                },
              })
            } else {
              replaceLastTurn(pending, {
                kind: 'error',
                message: ASSISTANT_API_FAILURE,
              })
            }
          } finally {
            setLoading(false)
          }
          return
        }
      }

      if (kind === 'session') {
        navigate(`/sesje/${itemId}`)
        closeAssistant()
        return
      }

      const pendingSemantic = choice?.pendingSemantic ?? null
      if (pendingSemantic) {
        const continued = withResolvedWedding(pendingSemantic, itemId)
        const label =
          choice?.items.find((i) => i.id === itemId)?.title ?? 'Wybrane zlecenie'
        await continueSemantic(continued, label, 'replace')
        return
      }

      // Legacy fallback without pendingSemantic — refuse silent summary downgrade
      replaceLastTurn('Wybrane zlecenie', {
        kind: 'error',
        message: ASSISTANT_API_FAILURE,
      })
      return
    },
    [turns, navigate, closeAssistant, continueSemantic, replaceLastTurn],
  )

  const onChangeWedding = useCallback(() => {
    if (!lastChoice || lastChoice.kind !== 'choice') return
    replaceLastTurn(
      turns[turns.length - 1]?.userText ?? 'Wybór zlecenia',
      lastChoice,
    )
  }, [lastChoice, replaceLastTurn, turns])

  const onConfirmCreateWedding = useCallback(async () => {
    if (!preparedWedding) return
    setConfirming(true)
    try {
      const wedding = await createWedding.mutateAsync(
        buildCreateWeddingInput(preparedWedding),
      )
      appendResponse('Potwierdzono utworzenie', {
        kind: 'success',
        message: 'Zlecenie utworzone',
        title: preparedWedding.displayLabel,
        subtitle: preparedWedding.dateLabel,
        navigate: {
          path: `/sluby/${wedding.id}`,
          label: 'Otwórz zlecenie',
        },
      })
      setPreparedWedding(null)
    } catch {
      appendResponse('Potwierdzono utworzenie', {
        kind: 'error',
        message: ASSISTANT_API_FAILURE,
      })
    } finally {
      setConfirming(false)
    }
  }, [preparedWedding, createWedding, appendResponse])

  const onConfirmCreateTask = useCallback(async () => {
    if (!preparedTask) return
    setConfirming(true)
    try {
      await taskService.create({
        title: preparedTask.title,
        dueDate: preparedTask.dueDate,
        weddingId: preparedTask.weddingId,
      })
      void invalidateTaskDomain(queryClient)
      appendResponse('Potwierdzono zadanie', {
        kind: 'success',
        message: 'Zadanie dodane',
        title: preparedTask.title,
        subtitle: preparedTask.dueDateLabel,
        navigate: preparedTask.weddingId
          ? {
              path: `/sluby/${preparedTask.weddingId}`,
              label: 'Otwórz zlecenie',
            }
          : { path: '/zadania', label: 'Otwórz zadania' },
      })
      setPreparedTask(null)
    } catch {
      appendResponse('Potwierdzono zadanie', {
        kind: 'error',
        message: ASSISTANT_API_FAILURE,
      })
    } finally {
      setConfirming(false)
    }
  }, [preparedTask, queryClient, appendResponse])

  const onNavigate = useCallback(
    (path: string) => {
      if (!path.startsWith('/')) return
      navigate(path)
      closeAssistant()
    },
    [navigate, closeAssistant],
  )

  const onCancelConfirm = useCallback(() => {
    setPreparedWedding(null)
    setPreparedTask(null)
    setTurns((prev) =>
      prev.filter((t) => t.response?.kind !== 'confirmation'),
    )
  }, [])

  const onSelectClarification = useCallback(
    async (optionId: string) => {
      // U3 DEV/shadow: GoalSpec-native typed clarification (no interpreter).
      if (isGoalClarificationHostEnabled()) {
        const goalPending = getPendingGoalClarification()
        if (goalPending) {
          if (resolvingClarificationIdRef.current === goalPending.id) {
            return
          }
          const goalOpt = goalPending.options.find(
            (o) => String(o.value) === optionId,
          )
          if (!goalOpt) {
            setTurns([
              {
                id: createTurnId(),
                userText: 'Wybór',
                loading: false,
                response: {
                  kind: 'error',
                  message: ASSISTANT_CLARIFICATION_STALE,
                },
              },
            ])
            return
          }
          const selectedLabel = clarificationLabelCopy(goalOpt.labelKey)
          resolvingClarificationIdRef.current = goalPending.id
          setLoading(true)
          try {
            const { result, response } =
              submitGoalClarificationAnswerWithLabel({
                clarificationId: goalPending.id,
                slot: goalPending.slot,
                selectedValue: goalOpt.value,
                selectedLabel,
              })

            // IC1: allowlisted canary — clarification resumes to visible V5 (0 LLM)
            // only when typed semantic coverage is complete.
            if (
              isV5OwnershipPathEnabled() &&
              result.status === 'bound' &&
              isIc1CanaryDomainQueryEligible(result.query)
            ) {
              const coverage = assessSemanticCoverage({
                goalSpec: result.patchedGoal,
                boundGoal: result.goal,
                domainQuery: result.query,
              })
              if (coverage.status === 'complete') {
                const exec = await executeDomainQueryShadow(result.query)
                if (exec.ok) {
                  const v5Response = renderDomainQueryObservation(
                    exec.observation,
                  )
                  emitAssistantAuthorityDiagnostic(
                    buildAuthorityDiagnostic({
                      turnId: currentTurnIdRef.current ?? goalPending.id,
                      decision: {
                        kind: 'v5_authority',
                        ownershipActive: true,
                        eligibleForV5Authority: true,
                        visibleOwner: 'v5',
                        requestKind: 'domain_query',
                        resolverOutcome: 'bound',
                      },
                      effectiveMode: getEffectiveAssistantMode(),
                      interpreterStatus: 'skipped',
                      resolverOutcome: 'bound',
                      domainQueryStatus: 'executed',
                      canaryEligible: getCanaryEligible(),
                      semanticCoverageStatus: 'complete',
                      outcomeCode: 'clarification_resume',
                    }),
                  )
                  setV5ShadowClarification(null)
                  setGoalClarificationResolvedLabel(selectedLabel)
                  setV5ShadowResumeNote(null)
                  applyResponse(v5Response)
                  setTurns([
                    {
                      id: createTurnId(),
                      userText: selectedLabel,
                      response: v5Response,
                      loading: false,
                    },
                  ])
                  return
                }
              }
              // incomplete coverage or exec failure → fall through to V3
              if (coverage.status === 'incomplete') {
                emitAssistantAuthorityDiagnostic(
                  buildAuthorityDiagnostic({
                    turnId: currentTurnIdRef.current ?? goalPending.id,
                    decision: {
                      kind: 'v3_fallback',
                      visibleOwner: 'v3',
                      ownershipActive: false,
                      eligibleForV5Authority: false,
                      reason: 'SEMANTIC_COVERAGE_INCOMPLETE',
                      requestKind: 'domain_query',
                      resolverOutcome: 'bound',
                    },
                    effectiveMode: getEffectiveAssistantMode(),
                    interpreterStatus: 'skipped',
                    resolverOutcome: 'bound',
                    domainQueryStatus: 'valid',
                    canaryEligible: getCanaryEligible(),
                    semanticCoverageStatus: 'incomplete',
                    semanticCoverageReasons: coverage.reasonCodes,
                    outcomeCode: 'clarification_resume_coverage_incomplete',
                  }),
                )
              }
            }

            if (
              isV5OwnershipPathEnabled() &&
              result.status === 'needs_clarification' &&
              response.kind === 'clarification'
            ) {
              setGoalClarificationResolvedLabel(null)
              setTurns([
                {
                  id: currentTurnIdRef.current ?? createTurnId(),
                  userText: selectedLabel,
                  response,
                  loading: false,
                },
              ])
              return
            }

            // Shadow-only path (non-ownership): never replace V3 production answer.
            if (result.status === 'bound') {
              setV5ShadowClarification(null)
              setGoalClarificationResolvedLabel(null)
              setV5ShadowResumeNote(
                `V5 GoalSpec (shadow): wybrano «${selectedLabel}».`,
              )
            } else if (
              result.status === 'needs_clarification' &&
              response.kind === 'clarification'
            ) {
              setGoalClarificationResolvedLabel(null)
              setV5ShadowClarification({
                turnId: currentTurnIdRef.current ?? goalPending.id,
                response,
              })
              setV5ShadowResumeNote(null)
            } else {
              setV5ShadowClarification(null)
              setGoalClarificationResolvedLabel(null)
              setV5ShadowResumeNote(
                response.kind === 'error'
                  ? response.message
                  : 'V5 GoalSpec (shadow): nie udało się dokończyć doprecyzowania.',
              )
            }
          } finally {
            resolvingClarificationIdRef.current = null
            setLoading(false)
          }
          return
        }
      }

      const pending = workingContext.pendingClarification
      if (!pending) {
        setTurns([
          {
            id: createTurnId(),
            userText: 'Wybór',
            loading: false,
            response: {
              kind: 'error',
              message: ASSISTANT_CLARIFICATION_STALE,
            },
          },
        ])
        return
      }

      const clarificationId = pending.id ?? pending.signature ?? 'pending'
      if (resolvingClarificationIdRef.current === clarificationId) {
        return
      }

      const opt = pending.options.find((o) => o.id === optionId)
      if (!opt) {
        setTurns([
          {
            id: createTurnId(),
            userText: 'Wybór',
            loading: false,
            response: {
              kind: 'error',
              message: ASSISTANT_CLARIFICATION_STALE,
            },
          },
        ])
        return
      }

      const {
        applySemanticPatchToRequest,
        optionCanResume,
      } = await import('./orchestration/clarificationState')

      if (
        !optionCanResume(
          opt as Parameters<typeof optionCanResume>[0],
        )
      ) {
        setTurns([
          {
            id: createTurnId(),
            userText: opt.label,
            loading: false,
            response: {
              kind: 'error',
              message: ASSISTANT_CLARIFICATION_DEAD_OPTION,
            },
          },
        ])
        setWorkingContext((prev) =>
          applyWorkingContextPatch(prev, {
            pendingClarification: null,
            clarificationHistory: [
              ...(prev.clarificationHistory ?? []),
              pending.signature ?? optionId,
            ],
          }),
        )
        return
      }

      resolvingClarificationIdRef.current = clarificationId
      const label = opt.label
      const userTextForResume =
        pending.originalUtterance?.trim() || label
      setLoading(true)
      setTurns([
        {
          id: createTurnId(),
          userText: label,
          response: null,
          loading: true,
        },
      ])
      try {
        const resumeBase =
          (opt.resumeSemantic as AssistantSemanticRequest | undefined) ??
          (pending.resumeSemantic as AssistantSemanticRequest | undefined) ??
          null
        const placeScopeDefault =
          (pending.goalType === 'places'
            ? (workingContext.lastDirectContext?.placeScope as
                | 'preparations'
                | 'bride_preparation'
                | 'groom_preparation'
                | 'ceremony'
                | 'reception'
                | 'all'
                | null
                | undefined)
            : null) ?? 'preparations'
        const patched = opt.semanticPatch
          ? applySemanticPatchToRequest(
              resumeBase,
              opt.semanticPatch as Parameters<
                typeof applySemanticPatchToRequest
              >[1],
              pending.originalUtterance,
              placeScopeDefault,
            )
          : null

        // Prefer patched over raw resume — Never re-interpret option labels as NL.
        const semanticRequest =
          patched ??
          (opt.resumeSemantic as AssistantSemanticRequest | null | undefined) ??
          (pending.resumeSemantic as AssistantSemanticRequest | null | undefined) ??
          null
        const queryPlan = opt.resumePlan
          ? (opt.resumePlan as import('./api/queryPlanSchema').AssistantQueryPlan)
          : null

        if (!semanticRequest && !queryPlan) {
          setTurns([
            {
              id: createTurnId(),
              userText: label,
              loading: false,
              response: {
                kind: 'error',
                message: ASSISTANT_CLARIFICATION_DEAD_OPTION,
              },
            },
          ])
          setWorkingContext((prev) =>
            applyWorkingContextPatch(prev, {
              pendingClarification: null,
              clarificationHistory: [
                ...(prev.clarificationHistory ?? []),
                pending.signature ?? optionId,
              ],
            }),
          )
          return
        }

        const resolvedSlots = [
          ...(pending.resolvedSlots ?? []),
          ...(pending.slot ? [pending.slot] : []),
        ].filter(Boolean)

        const result = await runAssistantQuery({
          userText: userTextForResume,
          pageContext,
          sessionContext: { weddingId: sessionWeddingId },
          workingContext: {
            ...workingContext,
            pendingClarification: null,
            clarificationHistory: [
              ...(workingContext.clarificationHistory ?? []),
              pending.signature ?? optionId,
            ],
          },
          queryPlan,
          semanticRequest,
        })
        setWorkingContext((prev) =>
          applyWorkingContextPatch(prev, {
            ...result.contextPatch,
            clarificationHistory: [
              ...(prev.clarificationHistory ?? []),
              pending.signature ?? optionId,
            ],
            pendingClarification: result.contextPatch.pendingClarification
              ? {
                  ...result.contextPatch.pendingClarification,
                  resolvedSlots: [
                    ...new Set([
                      ...(result.contextPatch.pendingClarification
                        .resolvedSlots ?? []),
                      ...resolvedSlots,
                    ]),
                  ],
                }
              : null,
          }),
        )
        applyResponse(result.response)
        setTurns([
          {
            id: createTurnId(),
            userText: label,
            response: result.response,
            loading: false,
          },
        ])
      } catch {
        setTurns([
          {
            id: createTurnId(),
            userText: label,
            loading: false,
            response: { kind: 'error', message: ASSISTANT_API_FAILURE },
          },
        ])
      } finally {
        resolvingClarificationIdRef.current = null
        setLoading(false)
      }
    },
    [workingContext, pageContext, sessionWeddingId, applyResponse],
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

  const showChangeWedding =
    Boolean(lastChoice && lastChoice.kind === 'choice') &&
    turns.length > 0 &&
    turns[turns.length - 1]?.response?.kind !== 'choice' &&
    Boolean(contextHeader)

  return (
    <AssistantContext.Provider value={value}>
      {children}
      <AssistantSurface
        open={open}
        isMobile={isMobile}
        turns={turns}
        loading={loading}
        confirming={confirming}
        contextHeader={contextHeader}
        showChangeWedding={showChangeWedding}
        onClose={closeAssistant}
        onSubmit={(text) => void runQuery(text)}
        onSelectChoice={(id, kind) => void onSelectChoice(id, kind)}
        onSelectClarification={(id) => void onSelectClarification(id)}
        onChangeWedding={onChangeWedding}
        onConfirmCreateWedding={() => void onConfirmCreateWedding()}
        onConfirmCreateTask={() => void onConfirmCreateTask()}
        onNavigate={onNavigate}
        onCancelConfirm={onCancelConfirm}
        goalClarificationResolvedLabel={goalClarificationResolvedLabel}
        v5ShadowClarification={
          v5ShadowClarification &&
          turns[0]?.id === v5ShadowClarification.turnId
            ? v5ShadowClarification.response
            : null
        }
        v5ShadowResumeNote={v5ShadowResumeNote}
      />
    </AssistantContext.Provider>
  )
}
