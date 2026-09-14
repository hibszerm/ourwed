/**
 * Client orchestration for Zapytaj OurWed.
 *
 * LOCAL transport: deterministic parser → common semantic orchestrator
 * EDGE transport: Edge language interpretation → domain executor
 *
 * Never falls back from Edge to local heuristic.
 * Edge never receives CRM blobs — only utterance + tiny context hints.
 */

import {
  ASSISTANT_API_FAILURE,
  ASSISTANT_CLARIFICATION_TYPE_NAME,
  ASSISTANT_PARTICIPANT_AMBIGUOUS,
  ASSISTANT_PARTICIPANT_NOT_FOUND,
  ASSISTANT_UNSUPPORTED,
} from '../copy'
import { executeAssistantSemanticRequest } from './executeSemantic'
import { executeAssistantQueryPlan } from './executeQueryPlan'
import { runLocalAssistantOrchestrator } from './localHeuristic'
import {
  resolveAssistantTransport,
  type AssistantTransport,
} from './transport'
import {
  aggregateSemanticToQueryPlan,
  unsupportedMessage,
  validateAssistantDomainRequest,
} from './validateDomain'
import {
  buildEdgeInterpretationPayload,
  validateAssistantSemanticRequest,
} from './validateSemantic'
import { executeAssistantAgentPlan } from '../orchestration/executeAgentPlan'
import { validateAssistantAgentPlan } from '../orchestration/validateAgentPlan'
import {
  applySemanticPatchToRequest,
  buildGoalResumeSemantic,
  clarificationSignature,
  createClarificationId,
  filterResumableOptions,
  isNumberedPlaceholderLabel,
  isPrematureEntityTypeClarification,
  looksLikeTemporalWorkdayGoal,
  optionCanResume,
  tryDeterministicParticipantCorrection,
  tryDeterministicCollectionFinanceFollowUp,
  weddingFinancesToCollectionSumPlan,
  wouldLoopClarification,
  type ClarificationOptionStructured,
  type ClarificationSemanticPatch,
  type ClarificationSlot,
} from '../orchestration/clarificationState'
import type {
  AssistantClarificationOption,
  AssistantDomainRequest,
  AssistantEdgeRequest,
  AssistantEdgeResponse,
  AssistantResponse,
  AssistantSemanticRequest,
  PageContextHint,
} from '../types'
import {
  buildModelWorkingContext,
  emptyWorkingContext,
  type AssistantWorkingContext,
  type WorkingContextPatch,
} from './workingContext'
import {
  matchParticipantByNameQuery,
  participantsFromCouple,
  type AssistantParticipantKey,
} from './participants'
import {
  extractPersonName,
  polishPersonSearchQueries,
  refineSemanticRequestFromUtterance,
} from './intentParse'
import { executeAssistantTool } from '../tools/executeTool'

type InvokeFn = (
  functionName: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: unknown }>

const defaultInvoke: InvokeFn = async (functionName, options) => {
  const { supabase } = await import('@/lib/supabase')
  return supabase.functions.invoke(functionName, options)
}

/** @deprecated No longer used — local mode never probes Edge. Kept for test imports. */
export function __resetAssistantDevEdgeCacheForTests() {
  /* no-op */
}

/** @deprecated Prefer resolveAssistantTransport() === 'local' */
export function isAssistantDevLocalFallbackEnabled(): boolean {
  return resolveAssistantTransport() === 'local'
}

export type AssistantRunResult = {
  response: AssistantResponse
  contextPatch: WorkingContextPatch
}

function asEdgeResponse(data: unknown): AssistantEdgeResponse | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>

  if (row.ok === true && row.data) return asEdgeResponse(row.data)
  if (row.ok === false) {
    return {
      status: 'error',
      message: ASSISTANT_API_FAILURE,
      code: typeof row.code === 'string' ? row.code : 'edge_error',
    }
  }

  if (row.status === 'domain' && row.request && typeof row.request === 'object') {
    return {
      status: 'domain',
      request: row.request as AssistantDomainRequest,
      diagnostics:
        row.diagnostics && typeof row.diagnostics === 'object'
          ? (row.diagnostics as AssistantEdgeResponse & {
              status: 'domain'
            })['diagnostics']
          : undefined,
    }
  }

  if (row.status === 'semantic' && row.request && typeof row.request === 'object') {
    const diagnosticsRaw = row.diagnostics
    let diagnostics:
      | {
          durationMs?: number
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
      | undefined
    if (diagnosticsRaw && typeof diagnosticsRaw === 'object') {
      const d = diagnosticsRaw as Record<string, unknown>
      diagnostics = {
        durationMs:
          typeof d.durationMs === 'number' ? d.durationMs : undefined,
        usage:
          d.usage && typeof d.usage === 'object'
            ? (d.usage as {
                prompt_tokens?: number
                completion_tokens?: number
              })
            : undefined,
      }
    }
    return {
      status: 'semantic',
      request: row.request as AssistantSemanticRequest,
      diagnostics,
    }
  }

  if (row.status === 'final' && row.response && typeof row.response === 'object') {
    return { status: 'final', response: row.response as AssistantResponse }
  }

  if (row.status === 'error') {
    return {
      status: 'error',
      message:
        typeof row.message === 'string' ? row.message : ASSISTANT_API_FAILURE,
      code: typeof row.code === 'string' ? row.code : undefined,
    }
  }

  return null
}

async function invokeEdgeSemantic(
  body: AssistantEdgeRequest,
  invoke: InvokeFn,
): Promise<AssistantEdgeResponse> {
  try {
    const { data, error } = await invoke('ai-assistant', {
      body: body as unknown as Record<string, unknown>,
    })
    if (error) {
      return { status: 'error', message: ASSISTANT_API_FAILURE, code: 'invoke_error' }
    }
    const parsed = asEdgeResponse(data)
    if (!parsed) {
      return {
        status: 'error',
        message: ASSISTANT_API_FAILURE,
        code: 'malformed_response',
      }
    }
    return parsed
  } catch {
    return { status: 'error', message: ASSISTANT_API_FAILURE, code: 'network' }
  }
}

function patchFromDirectResponse(
  response: AssistantResponse,
  sessionWeddingId: string | null,
  semantic?: AssistantSemanticRequest | null,
  sourceText?: string | null,
  workingContext?: AssistantWorkingContext | null,
): WorkingContextPatch {
  if (response.kind === 'schedule') {
    const items = response.items ?? []
    const sole = items.length === 1 ? items[0] : null
    const patch: WorkingContextPatch = {
      activeCollection: null,
      activeParticipant: null,
      lastOperation: { type: 'direct' },
      lastDirectContext: { intent: 'schedule' },
      pendingClarification: null,
      temporalAnchor: {
        phrase:
          semantic?.kind === 'schedule'
            ? semantic.datePhrase
            : sourceText?.trim() || response.dateLabel,
        from: response.date,
        to: response.date,
      },
      lastResolvedRequest: {
        goalType: 'schedule',
        capabilities: ['get_schedule'],
      },
      discourseFocus: {
        sequenceKind: 'schedule',
        weddingId: sole?.kind === 'wedding' ? sole.id : null,
      },
    }
    if (sole?.kind === 'wedding') {
      patch.activeResource = {
        kind: 'wedding',
        id: sole.id,
        displayLabel: sole.displayName,
      }
    } else if (sole?.kind === 'session') {
      patch.activeResource = {
        kind: 'session',
        id: sole.id,
        displayLabel: sole.displayName,
      }
    } else {
      patch.activeResource = null
    }
    return patch
  }
  if (response.kind === 'clarification') {
    const slot: ClarificationSlot = 'other'
    const signature = clarificationSignature({
      slot,
      goalType: 'clarification',
      optionIds: response.options.map((o) => o.id),
    })
    return {
      pendingClarification: {
        id: createClarificationId(),
        question: response.question,
        options: response.options.map((o) => ({
          id: o.id,
          label: o.label,
          resumePlan: o.plan ?? undefined,
          resumeSemantic: o.semantic ?? undefined,
          semanticPatch: o.semanticPatch ?? undefined,
        })),
        slot,
        signature,
        depth: 1,
        resolvedSlots: [],
        originalUtterance: sourceText ?? null,
        resumeSemantic: workingContext
          ? buildGoalResumeSemantic(workingContext)
          : null,
      },
    }
  }
  if (response.kind === 'error') {
    const patch: WorkingContextPatch = { pendingClarification: null }
    if (response.message === ASSISTANT_PARTICIPANT_NOT_FOUND) {
      const weddingId =
        workingContext?.activeResource?.kind === 'wedding'
          ? workingContext.activeResource.id
          : sessionWeddingId
      const placeScope =
        (semantic?.kind === 'wedding_places'
          ? semantic.requestedRole
          : null) ??
        workingContext?.lastDirectContext?.placeScope ??
        workingContext?.lastResolvedRequest?.placeScope ??
        'preparations'
      patch.pendingCorrection = {
        goalType: 'places',
        missingSlot: 'participant',
        placeScope:
          placeScope === 'bride_preparation' ||
          placeScope === 'groom_preparation' ||
          placeScope === 'preparations' ||
          placeScope === 'ceremony' ||
          placeScope === 'reception' ||
          placeScope === 'all'
            ? placeScope
            : 'preparations',
        weddingId,
      }
    }
    return patch
  }
  if (response.kind === 'unsupported') {
    return { pendingClarification: null }
  }

  const participantsFromCard = (w: {
    partner1?: string | null
    partner2?: string | null
  }) =>
    participantsFromCouple({
      partner1: w.partner1,
      partner2: w.partner2,
    })

  if (response.kind === 'wedding') {
    const participants = participantsFromCard(response.wedding)
    return {
      activeResource: {
        kind: 'wedding',
        id: response.wedding.id,
        displayLabel: response.wedding.displayName,
        participants,
      },
      lastOperation: { type: 'direct' },
      lastDirectContext: { intent: 'open_wedding' },
      pendingClarification: null,
      lastResolvedRequest: { goalType: 'open' },
      pendingCorrection: null,
    }
  }
  if (response.kind === 'session') {
    return {
      activeResource: {
        kind: 'session',
        id: response.session.id,
        displayLabel: response.session.displayName,
      },
      activeParticipant: null,
      lastOperation: { type: 'direct' },
      lastDirectContext: { intent: 'open_session' },
      pendingClarification: null,
      pendingCorrection: null,
    }
  }
  if (response.kind === 'places') {
    const participants = participantsFromCard(response.wedding)
    const focus = response.focusRole
    let participantKey =
      semantic?.kind === 'wedding_places'
        ? semantic.participantKey ?? null
        : null
    if (!participantKey && response.places.length === 1) {
      participantKey = response.places[0]?.participantKey ?? null
    }
    const placeScope =
      focus === 'bride_preparation' ||
      focus === 'groom_preparation' ||
      focus === 'preparations' ||
      focus === 'ceremony' ||
      focus === 'reception' ||
      focus === 'all'
        ? focus
        : 'all'
    const activeParticipant =
      participantKey &&
      participants.some((p) => p.key === participantKey)
        ? {
            weddingId: response.wedding.id,
            participantKey,
            displayLabel:
              participants.find((p) => p.key === participantKey)
                ?.canonicalName ?? participantKey,
          }
        : null
    const dayPlanStage =
      placeScope === 'all' ? null : placeScope === 'preparations'
        ? participantKey === 'p2'
          ? 'groom_preparation'
          : 'bride_preparation'
        : placeScope

    const patch: WorkingContextPatch = {
      activeResource: {
        kind: 'wedding',
        id: response.wedding.id,
        displayLabel: response.wedding.displayName,
        participants,
      },
      activeParticipant,
      lastOperation: { type: 'direct' },
      lastDirectContext: {
        intent: 'wedding_places',
        placeScope,
        participantKey,
      },
      pendingClarification: null,
      pendingCorrection: null,
      lastResolvedRequest: {
        goalType: 'places',
        placeScope,
        participantKey,
      },
      discourseFocus: {
        weddingId: response.wedding.id,
        participantKey,
        placeScope,
        dayPlanStage,
        sequenceKind: 'day_plan',
      },
    }

    // Arm correction when places empty for a named / requested participant
    const emptyIsParticipant =
      Boolean(response.emptyMessage) &&
      (response.emptyMessage === ASSISTANT_PARTICIPANT_NOT_FOUND ||
        (semantic?.kind === 'wedding_places' &&
          Boolean(
            semantic.participantKey ||
              semantic.participantRole ||
              semantic.resolver.personQuery,
          )))
    if (emptyIsParticipant || response.emptyMessage === ASSISTANT_PARTICIPANT_NOT_FOUND) {
      patch.pendingCorrection = {
        goalType: 'places',
        missingSlot: 'participant',
        placeScope,
        weddingId: response.wedding.id,
      }
    }

    return patch
  }
  if (response.kind === 'day_plan') {
    const participants = participantsFromCard(response.wedding)
    const participantKey =
      semantic?.kind === 'wedding_day_plan'
        ? semantic.participantKey ?? null
        : null
    const activeParticipant =
      participantKey &&
      participants.some((p) => p.key === participantKey)
        ? {
            weddingId: response.wedding.id,
            participantKey,
            displayLabel:
              participants.find((p) => p.key === participantKey)
                ?.canonicalName ?? participantKey,
          }
        : null
    const firstStop = response.stops?.[0]
    const focusedStage =
      inferDayPlanStageFromStop(firstStop) ??
      (response.focus === 'ceremony' ||
      response.focus === 'preparations' ||
      response.focus === 'earliest'
        ? response.focus === 'earliest'
          ? inferDayPlanStageFromStop(firstStop)
          : response.focus
        : null)
    return {
      activeResource: {
        kind: 'wedding',
        id: response.wedding.id,
        displayLabel: response.wedding.displayName,
        participants,
      },
      ...(activeParticipant ? { activeParticipant } : {}),
      lastOperation: { type: 'direct' },
      lastDirectContext: {
        intent: 'wedding_day_plan',
        dayPlanFocus: response.focus ?? 'full',
        participantKey,
        placeScope:
          focusedStage === 'ceremony' ||
          focusedStage === 'reception' ||
          focusedStage === 'bride_preparation' ||
          focusedStage === 'groom_preparation' ||
          focusedStage === 'preparations'
            ? focusedStage
            : undefined,
      },
      pendingClarification: null,
      pendingCorrection: null,
      lastResolvedRequest: {
        goalType: 'day_plan',
        dayPlanFocus: response.focus ?? 'full',
        participantKey,
      },
      discourseFocus: {
        weddingId: response.wedding.id,
        participantKey,
        dayPlanStage: focusedStage,
        sequenceKind: 'day_plan',
        placeScope:
          focusedStage === 'ceremony' ||
          focusedStage === 'reception' ||
          focusedStage === 'bride_preparation' ||
          focusedStage === 'groom_preparation' ||
          focusedStage === 'preparations'
            ? focusedStage
            : null,
      },
    }
  }
  if (response.kind === 'finance') {
    const financeAspect = response.financeAspect ?? 'overview'
    return {
      activeResource: {
        kind: 'wedding',
        id: response.finance.weddingId,
        displayLabel: response.finance.displayName,
      },
      lastOperation: { type: 'direct' },
      lastDirectContext: {
        intent: 'wedding_finances',
        financeAspect,
      },
      pendingClarification: null,
      pendingCorrection: null,
      lastResolvedRequest: {
        goalType: 'finances',
        financeAspect,
      },
      discourseFocus: {
        weddingId: response.finance.weddingId,
        financeAspect,
      },
    }
  }
  if (response.kind === 'next_action') {
    return {
      activeResource: {
        kind: 'wedding',
        id: response.wedding.id,
        displayLabel: response.wedding.displayName,
        participants: participantsFromCard(response.wedding),
      },
      lastOperation: { type: 'direct' },
      lastDirectContext: { intent: 'wedding_next_action' },
      pendingClarification: null,
      lastResolvedRequest: { goalType: 'next_action' },
      pendingCorrection: null,
    }
  }
  if (response.kind === 'tasks' && response.wedding) {
    return {
      activeResource: {
        kind: 'wedding',
        id: response.wedding.id,
        displayLabel: response.wedding.displayName,
        participants: participantsFromCard(response.wedding),
      },
      lastOperation: { type: 'direct' },
      lastDirectContext: { intent: 'wedding_tasks' },
      pendingClarification: null,
      lastResolvedRequest: { goalType: 'tasks' },
      pendingCorrection: null,
    }
  }
  if (response.kind === 'text') {
    return {
      lastOperation: { type: 'direct' },
      pendingClarification: null,
    }
  }
  void sessionWeddingId
  return { lastOperation: { type: 'direct' }, pendingClarification: null }
}

function inferDatePhraseFromUtterance(utterance: string): string | null {
  const t = utterance.toLowerCase()
  if (/\bjutro\b/.test(t)) return 'jutro'
  if (/\bpojutrze\b/.test(t)) return 'pojutrze'
  if (/\b(dzi[sś]|dzisiaj)\b/.test(t)) return 'dziś'
  if (/\bw\s+sobot/.test(t)) return 'w sobotę'
  if (/\bw\s+niedziel/.test(t)) return 'w niedzielę'
  if (/\bweekend/.test(t)) return 'ten weekend'
  const md = utterance.match(/\b(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b/)
  if (md) return md[1]!
  return null
}

function inferClarificationSlot(
  question: string,
  options: Array<{ label: string }>,
): ClarificationSlot {
  const q = question.toLowerCase()
  const labels = options.map((o) => o.label.toLowerCase())
  if (/uczestn|panna|pan m[łl]od|osob/.test(q) || labels.some((l) => /panna|pan m/.test(l))) {
    return 'participant'
  }
  if (/[sś]lub/.test(q) && /osob/.test(q)) return 'entity_type'
  if (/zlecen|sesj|które/.test(q)) return 'assignment'
  if (/przygotow|ceremon|wesel|sal/.test(q)) return 'placeScope'
  return 'other'
}

export async function executeAssistantDomainRequest(input: {
  domain: AssistantDomainRequest
  pageContext?: PageContextHint | null
  sessionContext?: { weddingId?: string | null } | null
  workingContext: AssistantWorkingContext
  sourceText?: string | null
}): Promise<AssistantRunResult> {
  const { domain } = input

  if (domain.kind === 'unsupported') {
    return {
      response: {
        kind: 'unsupported',
        message: unsupportedMessage(domain),
      },
      contextPatch: { pendingClarification: null },
    }
  }

  if (domain.kind === 'plan') {
    let planDomain = domain
    // Sequence safety: day-plan focus + full-plan capability → next stage only
    // Do NOT rewrite when the utterance names a concrete stage/prep (role ownership).
    const seqStage = resolveActiveDayPlanStage(input.workingContext)
    const utteranceLower = (input.sourceText ?? '').toLowerCase()
    const utteranceNamesConcreteStage =
      /\bprzygotowa/i.test(utteranceLower) ||
      /\bceremon/i.test(utteranceLower) ||
      /\bprzyj[eę]c/i.test(utteranceLower) ||
      /\bsal[aeiyęą]\b/i.test(utteranceLower)
    if (seqStage && !utteranceNamesConcreteStage) {
      const validatedPeek = validateAssistantAgentPlan(domain)
      const caps = validatedPeek?.steps.map((s) => s.capability) ?? []
      const wantsFullDayPlan =
        caps.includes('get_wedding_day_plan') &&
        !caps.includes('get_next_day_plan_stage')
      if (wantsFullDayPlan) {
        const weddingId =
          input.workingContext.discourseFocus?.weddingId ??
          (input.workingContext.activeResource?.kind === 'wedding'
            ? input.workingContext.activeResource.id
            : null)
        planDomain = {
          kind: 'plan',
          goal: 'next_day_plan_stage',
          steps: [
            {
              id: 's1',
              capability: 'get_next_day_plan_stage',
              input: {
                weddingId,
                fromStage: seqStage,
                participantKey:
                  input.workingContext.discourseFocus?.participantKey ?? null,
              },
            },
          ],
        }
      }
    }
    const plan = validateAssistantAgentPlan(planDomain)
    if (!plan) {
      return {
        response: {
          kind: 'error',
          message:
            'Nie udało mi się pewnie zrozumieć tego pytania. Spróbuj napisać je trochę inaczej.',
        },
        contextPatch: {},
      }
    }
    const run = await executeAssistantAgentPlan({
      plan,
      pageContext: input.pageContext,
      sessionContext: input.sessionContext,
      workingContext: input.workingContext,
      sourceText: input.sourceText,
    })
    const patch: WorkingContextPatch = {
      ...run.contextPatch,
      ...(run.conversationPatch?.discourseFocus !== undefined
        ? { discourseFocus: run.conversationPatch.discourseFocus }
        : {}),
      ...(run.conversationPatch?.lastResolvedRequest !== undefined
        ? { lastResolvedRequest: run.conversationPatch.lastResolvedRequest }
        : {}),
      ...(run.conversationPatch?.pendingCorrection !== undefined
        ? { pendingCorrection: run.conversationPatch.pendingCorrection }
        : {}),
      ...(run.conversationPatch?.lastPlanSummary !== undefined
        ? { lastPlanSummary: run.conversationPatch.lastPlanSummary }
        : {}),
      lastOperation: run.contextPatch.lastOperation ?? {
        type: 'plan',
      },
    }
    if (import.meta.env?.DEV && run.trace) {
      console.info('[assistant] agent plan', run.trace)
    }
    return { response: run.response, contextPatch: patch }
  }

  if (domain.kind === 'clarification') {
    const utterance = input.sourceText?.trim() ?? ''
    const rawOptions = domain.options ?? []
    const premature = isPrematureEntityTypeClarification({
      question: domain.question,
      optionLabels: rawOptions.map((o) => o.label),
      utterance,
    })
    const slotEarly = inferClarificationSlot(domain.question, rawOptions)
    // Date clarification with temporal anchor → schedule immediately
    if (
      slotEarly === 'date' &&
      input.workingContext.temporalAnchor?.from &&
      looksLikeTemporalWorkdayGoal(utterance)
    ) {
      return executeAssistantDomainRequest({
        ...input,
        domain: {
          kind: 'direct',
          semantic: {
            kind: 'schedule',
            datePhrase:
              input.workingContext.temporalAnchor.phrase ||
              inferDatePhraseFromUtterance(utterance) ||
              'dziś',
          },
        },
      })
    }
    if (
      premature ||
      (looksLikeTemporalWorkdayGoal(utterance) &&
        rawOptions.every(
          (o) => !o.semantic && !o.plan && !o.semanticPatch,
        ))
    ) {
      // Prefer safe schedule read over entity-type clarification.
      return executeAssistantDomainRequest({
        ...input,
        domain: {
          kind: 'direct',
          semantic: {
            kind: 'schedule',
            datePhrase:
              input.workingContext.temporalAnchor?.phrase ||
              inferDatePhraseFromUtterance(utterance) ||
              'dziś',
          },
        },
      })
    }

    const resumeSemantic = buildGoalResumeSemantic(input.workingContext)
    const activeWeddingId =
      input.workingContext.activeResource?.kind === 'wedding'
        ? input.workingContext.activeResource.id
        : null
    const placeScopeDefault =
      (input.workingContext.lastResolvedRequest?.placeScope as
        | ClarificationSemanticPatch['placeScope']
        | undefined) ??
      input.workingContext.lastDirectContext?.placeScope ??
      'preparations'

    const enrichOption = (
      o: AssistantClarificationOption,
    ): ClarificationOptionStructured => {
      let semanticPatch = o.semanticPatch
        ? { ...o.semanticPatch }
        : null
      if (
        semanticPatch?.participantKey &&
        !semanticPatch.weddingId &&
        activeWeddingId
      ) {
        semanticPatch = { ...semanticPatch, weddingId: activeWeddingId }
      }
      let resume =
        (o.semantic as AssistantSemanticRequest | null | undefined) ?? null
      if (
        !resume &&
        semanticPatch &&
        (semanticPatch.participantKey || semanticPatch.weddingId)
      ) {
        resume = applySemanticPatchToRequest(
          resumeSemantic,
          semanticPatch as ClarificationSemanticPatch,
          utterance,
          placeScopeDefault === 'preparations' ||
            placeScopeDefault === 'bride_preparation' ||
            placeScopeDefault === 'groom_preparation' ||
            placeScopeDefault === 'ceremony' ||
            placeScopeDefault === 'reception' ||
            placeScopeDefault === 'all'
            ? placeScopeDefault
            : 'preparations',
        )
      }
      return {
        id: o.id,
        label: o.label,
        resumePlan: o.plan ?? undefined,
        resumeSemantic: resume,
        semanticPatch: semanticPatch as ClarificationSemanticPatch | null,
      }
    }

    let structured = rawOptions.map(enrichOption)
    let resumable = filterResumableOptions(structured)
    const slot = inferClarificationSlot(domain.question, rawOptions)

    const needsPersonRebuild =
      resumable.length === 0 ||
      resumable.every(
        (o) =>
          isNumberedPlaceholderLabel(o.label) ||
          !optionCanResume(o),
      ) ||
      (slot === 'participant' &&
        resumable.some((o) => isNumberedPlaceholderLabel(o.label)))

    // Regenerate participant options with full resumeSemantic when Edge chips are dead
    if (
      (resumable.length === 0 || needsPersonRebuild) &&
      (slot === 'participant' || needsPersonRebuild) &&
      input.workingContext.activeResource?.kind === 'wedding' &&
      (input.workingContext.activeResource.participants?.length ?? 0) > 0
    ) {
      const weddingId = input.workingContext.activeResource.id
      const scope =
        placeScopeDefault === 'preparations' ||
        placeScopeDefault === 'bride_preparation' ||
        placeScopeDefault === 'groom_preparation' ||
        placeScopeDefault === 'ceremony' ||
        placeScopeDefault === 'reception' ||
        placeScopeDefault === 'all'
          ? placeScopeDefault
          : 'preparations'
      structured = input.workingContext.activeResource.participants!.map(
        (p) => {
          const semantic: AssistantSemanticRequest = {
            kind: 'wedding_places',
            resolver: {
              personQuery: null,
              dateHint: null,
              weddingId,
            },
            requestedRole: scope,
            participantKey: p.key,
            participantRole: null,
          }
          return {
            id: p.key,
            label: p.canonicalName,
            resumeSemantic: semantic,
            semanticPatch: {
              participantKey: p.key,
              weddingId,
              placeScope: scope,
            },
          }
        },
      )
      resumable = filterResumableOptions(structured)
    }

    // Cross-wedding person ambiguity: Edge "Maks 1" → authoritative wedding search
    if (
      resumable.length === 0 ||
      (slot === 'participant' &&
        resumable.some((o) => isNumberedPlaceholderLabel(o.label))) ||
      (needsPersonRebuild && resumable.length === 0)
    ) {
      const rebuilt = await rebuildPersonWeddingClarificationOptions({
        utterance,
        placeScope: placeScopeDefault,
        originalUtterance:
          input.workingContext.pendingClarification?.originalUtterance ??
          input.workingContext.pendingCorrection
            ? utterance
            : utterance,
      })
      if (rebuilt.length > 0) {
        structured = rebuilt
        resumable = filterResumableOptions(structured)
      }
    }

    if (resumable.length === 0) {
      return {
        response: {
          kind: 'error',
          message:
            slot === 'participant'
              ? ASSISTANT_CLARIFICATION_TYPE_NAME
              : 'Nie udało mi się zaproponować bezpiecznego wyboru. Napisz proszę pytanie od nowa.',
        },
        contextPatch: {
          pendingClarification: null,
        },
      }
    }

    const signature = clarificationSignature({
      slot,
      goalType:
        input.workingContext.lastResolvedRequest?.goalType ?? 'clarification',
      optionIds: resumable.map((o) => o.id),
    })
    const pending = input.workingContext.pendingClarification
    if (
      wouldLoopClarification({
        pending: pending
          ? {
              id: pending.id ?? 'legacy',
              question: pending.question,
              slot: (pending.slot as ClarificationSlot) ?? 'other',
              signature: pending.signature ?? '',
              options: [],
              depth: pending.depth ?? 1,
              resolvedSlots: (pending.resolvedSlots ?? []) as ClarificationSlot[],
              resumeSemantic: null,
            }
          : null,
        nextSignature: signature,
        nextSlot: slot,
      })
    ) {
      return {
        response: {
          kind: 'error',
          message:
            'Nie udało mi się doprecyzować tego pytania bez zapętlenia. Napisz proszę wprost o co chodzi — na przykład o dzisiejsze zlecenie albo konkretną osobę.',
        },
        contextPatch: {
          pendingClarification: null,
          clarificationHistory: [
            ...(input.workingContext.clarificationHistory ?? []),
            signature,
          ],
        },
      }
    }

    const clarificationId = createClarificationId()
    const responseOptions: AssistantClarificationOption[] = resumable.map(
      (o) => ({
        id: o.id,
        label: o.label,
        semantic: o.resumeSemantic ?? null,
        plan: o.resumePlan ?? null,
        semanticPatch: o.semanticPatch ?? null,
      }),
    )

    return {
      response: {
        kind: 'clarification',
        question: domain.question || ASSISTANT_PARTICIPANT_AMBIGUOUS,
        options: responseOptions,
      },
      contextPatch: {
        pendingClarification: {
          id: clarificationId,
          question: domain.question,
          options: resumable.map((o) => ({
            id: o.id,
            label: o.label,
            resumePlan: o.resumePlan ?? undefined,
            resumeSemantic: o.resumeSemantic ?? undefined,
            semanticPatch: o.semanticPatch ?? undefined,
          })),
          slot,
          signature,
          depth: (pending?.depth ?? 0) + 1,
          resolvedSlots: (pending?.resolvedSlots ?? []) as ClarificationSlot[],
          originalUtterance: utterance || pending?.originalUtterance || null,
          goalType:
            input.workingContext.lastResolvedRequest?.goalType ??
            'clarification',
          resumeSemantic,
        },
        clarificationHistory: [
          ...(input.workingContext.clarificationHistory ?? []),
          signature,
        ],
      },
    }
  }

  if (domain.kind === 'query_plan') {
    return executeAssistantQueryPlan({
      plan: domain.plan,
      workingContext: input.workingContext,
    })
  }

  // direct
  let semantic = refineSemanticRequestFromUtterance(
    domain.semantic,
    input.sourceText,
  )
  if (
    import.meta.env?.DEV &&
    input.sourceText &&
    JSON.stringify(semantic) !== JSON.stringify(domain.semantic)
  ) {
    console.debug('[assistant] semantic refine', {
      utterancePreview: input.sourceText.trim().slice(0, 80),
      beforeKind: domain.semantic.kind,
      afterKind: semantic.kind,
      beforeFocus:
        domain.semantic.kind === 'wedding_day_plan'
          ? domain.semantic.focus
          : null,
      afterFocus:
        semantic.kind === 'wedding_day_plan' ? semantic.focus : null,
      beforeRole:
        domain.semantic.kind === 'wedding_places'
          ? domain.semantic.requestedRole
          : null,
      afterRole:
        semantic.kind === 'wedding_places' ? semantic.requestedRole : null,
    })
  }
  if (semantic.kind === 'aggregate') {
    const plan = aggregateSemanticToQueryPlan(semantic)
    return executeAssistantQueryPlan({
      plan,
      workingContext: input.workingContext,
    })
  }

  // Active collection + finance metric (no named wedding) → collection sum.
  // Scope: activeCollection beats page/activeResource for plural finance follow-ups.
  if (semantic.kind === 'wedding_finances') {
    const collectionPlan = weddingFinancesToCollectionSumPlan({
      semantic,
      workingContext: input.workingContext,
      utterance: input.sourceText,
    })
    if (collectionPlan) {
      return executeAssistantQueryPlan({
        plan: collectionPlan,
        workingContext: input.workingContext,
      })
    }
  }

  // Finance discourse: do not let Edge drift into day_plan when finances are active
  if (
    input.workingContext.lastResolvedRequest?.goalType === 'finances' &&
    semantic.kind === 'wedding_day_plan' &&
    !input.workingContext.discourseFocus?.dayPlanStage
  ) {
    const financeAspect =
      input.workingContext.discourseFocus?.financeAspect ??
      (input.workingContext.lastResolvedRequest.financeAspect as
        | 'remaining'
        | 'paid'
        | 'contract_value'
        | 'overview'
        | undefined) ??
      'overview'
    const weddingId =
      input.workingContext.activeResource?.kind === 'wedding'
        ? input.workingContext.activeResource.id
        : semantic.resolver.weddingId
    semantic = {
      kind: 'wedding_finances',
      resolver: {
        personQuery: null,
        dateHint: null,
        weddingId: weddingId ?? null,
      },
      financeAspect:
        financeAspect === 'remaining' ||
        financeAspect === 'paid' ||
        financeAspect === 'contract_value' ||
        financeAspect === 'overview'
          ? financeAspect
          : 'overview',
    }
  }

  // Sequence rewrite: active day-plan stage + non-specific day plan → next stage only
  // Skip when utterance names a concrete stage (preparations/ceremony/reception/sala).
  const activeDayPlanStage = resolveActiveDayPlanStage(input.workingContext)
  const directUtteranceLower = (input.sourceText ?? '').toLowerCase()
  const directNamesConcreteStage =
    /\bprzygotowa/i.test(directUtteranceLower) ||
    /\bceremon/i.test(directUtteranceLower) ||
    /\bprzyj[eę]c/i.test(directUtteranceLower) ||
    /\bsal[aeiyęą]\b/i.test(directUtteranceLower)
  if (
    activeDayPlanStage &&
    !directNamesConcreteStage &&
    semantic.kind === 'wedding_day_plan' &&
    isNonSpecificDayPlanFocus(semantic.focus)
  ) {
    const weddingId =
      semantic.resolver.weddingId ||
      input.workingContext.discourseFocus?.weddingId ||
      (input.workingContext.activeResource?.kind === 'wedding'
        ? input.workingContext.activeResource.id
        : null)
    return executeAssistantDomainRequest({
      ...input,
      domain: {
        kind: 'plan',
        goal: 'next_day_plan_stage',
        steps: [
          {
            id: 's1',
            capability: 'get_next_day_plan_stage',
            input: {
              weddingId,
              fromStage: activeDayPlanStage,
              participantKey:
                input.workingContext.discourseFocus?.participantKey ??
                ('participantKey' in semantic
                  ? semantic.participantKey ?? null
                  : null),
            },
          },
        ],
      },
    })
  }

  // Temporal: inject anchor into schedule when follow-up has no fresh date tokens
  if (
    semantic.kind === 'schedule' &&
    input.workingContext.temporalAnchor &&
    isGenericOrEmptyDatePhrase(semantic.datePhrase) &&
    isShortFollowUpWithoutDate(input.sourceText ?? '') &&
    (input.workingContext.lastResolvedRequest?.goalType === 'schedule' ||
      input.workingContext.lastResolvedRequest?.goalType === 'places')
  ) {
    semantic = {
      kind: 'schedule',
      datePhrase:
        input.workingContext.temporalAnchor.phrase ||
        input.workingContext.temporalAnchor.from ||
        semantic.datePhrase ||
        'dziś',
    }
  }

  // Inject activeResource into resolver when utterance is follow-up without person
  if (
    input.workingContext.activeResource?.kind === 'wedding' &&
    (semantic.kind === 'wedding_places' ||
      semantic.kind === 'wedding_day_plan' ||
      semantic.kind === 'wedding_finances' ||
      semantic.kind === 'wedding_tasks' ||
      semantic.kind === 'wedding_next_action' ||
      semantic.kind === 'open_wedding' ||
      semantic.kind === 'open_resource')
  ) {
    const resolver = { ...semantic.resolver }
    if (!resolver.personQuery && !resolver.weddingId) {
      resolver.weddingId = input.workingContext.activeResource.id
      semantic = { ...semantic, resolver } as AssistantSemanticRequest
    }
  }

  const sessionWeddingId =
    input.sessionContext?.weddingId ??
    (input.workingContext.activeResource?.kind === 'wedding'
      ? input.workingContext.activeResource.id
      : null)

  const response = await executeAssistantSemanticRequest({
    request: semantic,
    pageContext: input.pageContext,
    sessionContext: {
      weddingId: sessionWeddingId,
    },
    activeWeddingId: sessionWeddingId,
    sourceText: input.sourceText,
  })

  // Schedule → destination composition (goal-first, no second model round)
  if (
    response.kind === 'schedule' &&
    input.sourceText &&
    looksLikeDestinationFollowThrough(input.sourceText) &&
    response.items.length === 1 &&
    response.items[0]?.kind === 'wedding'
  ) {
    const weddingId = response.items[0]!.id
    const dayPlan = await executeAssistantSemanticRequest({
      request: {
        kind: 'wedding_day_plan',
        resolver: { personQuery: null, dateHint: null, weddingId },
        focus: 'earliest',
      },
      pageContext: null,
      sessionContext: { weddingId },
      activeWeddingId: weddingId,
      sourceText: input.sourceText,
    })
    if (dayPlan.kind === 'day_plan' && dayPlan.stops.length > 0) {
      const first = dayPlan.stops[0]!
      const message = formatWorkdayDestinationAnswer({
        dateLabel: response.dateLabel,
        weddingLabel: response.items[0]!.displayName,
        stopTitle: first.title,
        placeName: first.placeName,
        time: first.time,
      })
      const composed: AssistantResponse = {
        kind: 'text',
        message,
      }
      return {
        response: composed,
        contextPatch: {
          ...patchFromDirectResponse(
            response,
            input.workingContext.activeResource?.id ?? null,
            semantic,
            input.sourceText,
            input.workingContext,
          ),
          activeResource: {
            kind: 'wedding',
            id: weddingId,
            displayLabel: response.items[0]!.displayName,
            participants: participantsFromCouple({
              partner1: dayPlan.wedding.partner1,
              partner2: dayPlan.wedding.partner2,
            }),
          },
          lastDirectContext: {
            intent: 'wedding_day_plan',
            dayPlanFocus: 'earliest',
          },
          lastResolvedRequest: {
            goalType: 'schedule',
            dayPlanFocus: 'earliest',
            capabilities: ['get_schedule', 'get_wedding_day_plan'],
          },
          discourseFocus: {
            weddingId,
            dayPlanStage: first.role ?? first.key,
            placeScope: null,
            sequenceKind: 'day_plan',
          },
        },
      }
    }
  }

  // Hard guard: never dump full day plan while a sequence stage is focused
  if (
    resolveActiveDayPlanStage(input.workingContext) &&
    response.kind === 'day_plan' &&
    (response.stops?.length ?? 0) > 1
  ) {
    const weddingId =
      response.wedding.id ||
      (input.workingContext.activeResource?.kind === 'wedding'
        ? input.workingContext.activeResource.id
        : null)
    return executeAssistantDomainRequest({
      ...input,
      domain: {
        kind: 'plan',
        goal: 'next_day_plan_stage',
        steps: [
          {
            id: 's1',
            capability: 'get_next_day_plan_stage',
            input: {
              weddingId,
              fromStage: resolveActiveDayPlanStage(input.workingContext),
              participantKey:
                input.workingContext.discourseFocus?.participantKey ??
                ('participantKey' in semantic
                  ? semantic.participantKey ?? null
                  : null),
            },
          },
        ],
      },
    })
  }

  return {
    response,
    contextPatch: patchFromDirectResponse(
      response,
      input.workingContext.activeResource?.id ?? null,
      semantic,
      input.sourceText,
      input.workingContext,
    ),
  }
}

/** Infer operational day-plan stage from a rendered stop. */
function inferDayPlanStageFromStop(
  stop:
    | {
        role?: string | null
        key?: string | null
        title?: string | null
      }
    | null
    | undefined,
): string | null {
  if (!stop) return null
  const role = (stop.role ?? '').trim()
  if (
    role === 'bride_preparation' ||
    role === 'groom_preparation' ||
    role === 'ceremony' ||
    role === 'reception' ||
    role === 'preparations'
  ) {
    return role
  }
  const blob = `${stop.key ?? ''} ${stop.title ?? ''} ${role}`.toLowerCase()
  if (/groom|pana\s*młodego|pan\s*młody|panem\s*młodym/.test(blob)) {
    return 'groom_preparation'
  }
  if (/bride|panny\s*młodej|panna\s*młoda|panną\s*młodą/.test(blob)) {
    return 'bride_preparation'
  }
  if (/ceremon/.test(blob)) return 'ceremony'
  if (/recepc|przyj[eę]c|wesel|sala/.test(blob)) return 'reception'
  if (/przygotow/.test(blob)) return 'preparations'
  return role || null
}

function resolveActiveDayPlanStage(
  wc: AssistantWorkingContext,
): string | null {
  const stage =
    wc.discourseFocus?.dayPlanStage ??
    (wc.discourseFocus?.sequenceKind === 'day_plan'
      ? wc.discourseFocus.placeScope
      : null) ??
    (wc.lastResolvedRequest?.goalType === 'day_plan' ||
    wc.lastResolvedRequest?.goalType === 'places'
      ? wc.lastDirectContext?.placeScope
      : null) ??
    null
  if (
    stage === 'bride_preparation' ||
    stage === 'groom_preparation' ||
    stage === 'ceremony' ||
    stage === 'reception' ||
    stage === 'preparations'
  ) {
    return stage
  }
  return null
}

function isNonSpecificDayPlanFocus(
  focus: string | null | undefined,
): boolean {
  return (
    focus == null ||
    focus === 'full' ||
    focus === 'earliest' ||
    focus === ''
  )
}

function isGenericOrEmptyDatePhrase(phrase: string | null | undefined): boolean {
  const t = (phrase ?? '').trim().toLowerCase()
  if (!t) return true
  return t === 'dziś' || t === 'dzis' || t === 'dzisiaj' || t === 'today'
}

function isShortFollowUpWithoutDate(utterance: string): boolean {
  const t = utterance.trim()
  if (!t || t.length > 48) return false
  if (/\b(dzi[sś]|dzisiaj|jutro|pojutrze|sobot|niedziel|weekend)\b/i.test(t)) {
    return false
  }
  if (/\b\d{1,2}[./]\d{1,2}\b/.test(t)) return false
  return true
}

function looksLikeDestinationFollowThrough(utterance: string): boolean {
  const t = utterance.toLowerCase()
  return (
    /\bgdzie\b/.test(t) ||
    /\bzaczynam\b/.test(t) ||
    /\bb[eę]d[eę]\b/.test(t) ||
    /\bruszam\b/.test(t)
  )
}

/** Rebuild cross-wedding person chips with authoritative labels + weddingId. */
async function rebuildPersonWeddingClarificationOptions(input: {
  utterance: string
  originalUtterance?: string | null
  placeScope: ClarificationSemanticPatch['placeScope'] | string | null | undefined
}): Promise<ClarificationOptionStructured[]> {
  const text = `${input.originalUtterance ?? ''} ${input.utterance}`.trim()
  const person =
    extractPersonName(input.utterance) ||
    extractPersonName(input.originalUtterance ?? '') ||
    extractPersonName(text)
  if (!person || person.length < 2) return []

  const scope =
    input.placeScope === 'preparations' ||
    input.placeScope === 'bride_preparation' ||
    input.placeScope === 'groom_preparation' ||
    input.placeScope === 'ceremony' ||
    input.placeScope === 'reception' ||
    input.placeScope === 'all'
      ? input.placeScope
      : 'preparations'

  const byId = new Map<
    string,
    {
      id: string
      displayName: string
      date: string | null
      partner1: string | null
      partner2: string | null
    }
  >()
  for (const query of polishPersonSearchQueries(person)) {
    const resolved = await executeAssistantTool({
      name: 'resolve_wedding',
      args: { query },
    })
    const data = resolved.data as {
      weddings?: Array<{
        id: string
        displayName: string
        date: string | null
        partner1: string | null
        partner2: string | null
      }>
    } | null
    for (const w of data?.weddings ?? []) {
      byId.set(w.id, w)
    }
  }

  const options: ClarificationOptionStructured[] = []
  for (const w of byId.values()) {
    const candidates = participantsFromCouple({
      partner1: w.partner1,
      partner2: w.partner2,
    })
    const hit = matchParticipantByNameQuery(candidates, person)
    if (!hit || hit === 'ambiguous') {
      // Still offer wedding-level resume without participantKey when both match-ish
      const semantic: AssistantSemanticRequest = {
        kind: 'wedding_places',
        resolver: {
          personQuery: person,
          dateHint: null,
          weddingId: w.id,
        },
        requestedRole: scope,
        participantKey: null,
        participantRole: null,
      }
      const dateBit = w.date ? ` — ${w.date}` : ''
      options.push({
        id: w.id,
        label: `${person} — ${w.displayName}${dateBit}`,
        resumeSemantic: semantic,
        semanticPatch: {
          weddingId: w.id,
          placeScope: scope,
        },
      })
      continue
    }
    const key = hit as AssistantParticipantKey
    const matched = candidates.find((c) => c.key === key)
    const semantic: AssistantSemanticRequest = {
      kind: 'wedding_places',
      resolver: {
        personQuery: null,
        dateHint: null,
        weddingId: w.id,
      },
      requestedRole: scope,
      participantKey: key,
      participantRole: null,
    }
    const dateBit = w.date ? ` — ${w.date}` : ''
    options.push({
      id: `${w.id}:${key}`,
      label: `${matched?.canonicalName ?? person} — ${w.displayName}${dateBit}`,
      resumeSemantic: semantic,
      semanticPatch: {
        participantKey: key,
        weddingId: w.id,
        placeScope: scope,
      },
    })
  }
  return options.slice(0, 6)
}

function formatWorkdayDestinationAnswer(input: {
  dateLabel: string
  weddingLabel: string
  stopTitle: string
  placeName: string | null
  time: string | null
}): string {
  const place =
    input.placeName && input.placeName.trim()
      ? ` — ${input.placeName.trim()}`
      : ''
  const time =
    input.time && input.time.trim() ? ` O ${input.time.trim()}.` : ''
  return `${input.dateLabel} zaczynasz od: ${input.stopTitle}${place}.${time}`.replace(
    /\.\./g,
    '.',
  )
}

/**
 * Run a user query through the selected transport.
 */
export async function runAssistantQuery(input: {
  userText: string
  pageContext?: PageContextHint | null
  sessionContext?: { weddingId?: string | null } | null
  workingContext?: AssistantWorkingContext | null
  /** Continue a pending semantic request after choice (skips Edge/parser). */
  semanticRequest?: AssistantSemanticRequest | null
  /** Continue a QueryPlan (clarification option / explicit). */
  queryPlan?: import('./queryPlanSchema').AssistantQueryPlan | null
  domainRequest?: AssistantDomainRequest | null
  /** Prior USER utterances only (bounded). */
  recentUtterances?: string[]
  priorMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  invoke?: InvokeFn
  signal?: AbortSignal
  transport?: AssistantTransport
  forceProductionBehavior?: boolean
  forceDevLocalFallback?: boolean
}): Promise<AssistantRunResult> {
  const workingContext = input.workingContext ?? emptyWorkingContext()

  const transport: AssistantTransport =
    input.transport ??
    (input.forceProductionBehavior
      ? 'edge'
      : input.forceDevLocalFallback
        ? 'local'
        : resolveAssistantTransport())

  if (input.domainRequest) {
    return executeAssistantDomainRequest({
      domain: input.domainRequest,
      pageContext: input.pageContext,
      sessionContext: input.sessionContext,
      workingContext,
      sourceText: input.userText,
    })
  }

  if (input.queryPlan) {
    return executeAssistantQueryPlan({
      plan: input.queryPlan,
      workingContext,
    })
  }

  // Choice continuation / explicit semantic — never re-interpret language.
  if (input.semanticRequest) {
    return executeAssistantDomainRequest({
      domain: { kind: 'direct', semantic: input.semanticRequest },
      pageContext: input.pageContext,
      sessionContext: {
        weddingId:
          input.sessionContext?.weddingId ??
          (workingContext.activeResource?.kind === 'wedding'
            ? workingContext.activeResource.id
            : null),
      },
      workingContext,
      sourceText: input.userText,
    })
  }

  // Deterministic participant correction before Edge (pendingCorrection / places miss)
  const deterministic = tryDeterministicParticipantCorrection({
    utterance: input.userText,
    workingContext,
  })
  if (deterministic?.kind === 'semantic') {
    const run = await executeAssistantDomainRequest({
      domain: { kind: 'direct', semantic: deterministic.semantic },
      pageContext: input.pageContext,
      sessionContext: {
        weddingId:
          input.sessionContext?.weddingId ??
          (workingContext.activeResource?.kind === 'wedding'
            ? workingContext.activeResource.id
            : null),
      },
      workingContext,
      sourceText: input.userText,
    })
    return {
      response: run.response,
      contextPatch: {
        ...run.contextPatch,
        pendingCorrection: null,
      },
    }
  }
  if (deterministic?.kind === 'clarification') {
    return {
      response: deterministic.response,
      contextPatch: {
        pendingClarification: {
          id: deterministic.pending.id,
          question: deterministic.pending.question,
          options: deterministic.pending.options.map((o) => ({
            id: o.id,
            label: o.label,
            resumePlan: o.resumePlan ?? undefined,
            resumeSemantic: o.resumeSemantic ?? undefined,
            semanticPatch: o.semanticPatch ?? undefined,
          })),
          slot: deterministic.pending.slot,
          signature: deterministic.pending.signature,
          depth: deterministic.pending.depth,
          resolvedSlots: deterministic.pending.resolvedSlots,
          originalUtterance: deterministic.pending.originalUtterance,
          goalType: deterministic.pending.goalType,
          resumeSemantic: deterministic.pending.resumeSemantic,
        },
      },
    }
  }

  // Phase 3D.1: activeCollection + finance metric → QueryPlan sum (before Edge)
  const collectionFinancePlan = tryDeterministicCollectionFinanceFollowUp({
    utterance: input.userText,
    workingContext,
  })
  if (collectionFinancePlan) {
    return executeAssistantQueryPlan({
      plan: collectionFinancePlan,
      workingContext,
    })
  }

  if (transport === 'local') {
    const response = await runLocalAssistantOrchestrator({
      userText: input.userText,
      pageContext: input.pageContext,
      sessionContext: {
        weddingId:
          input.sessionContext?.weddingId ??
          (workingContext.activeResource?.kind === 'wedding'
            ? workingContext.activeResource.id
            : null),
      },
    })
    // Local may still emit aggregate — route through domain
    if (response.kind === 'error' || response.kind === 'unsupported') {
      return { response, contextPatch: {} }
    }
    return {
      response,
      contextPatch: patchFromDirectResponse(
        response,
        workingContext.activeResource?.id ?? null,
        null,
        input.userText,
        workingContext,
      ),
    }
  }

  if (import.meta.env?.DEV) {
    console.info('[assistant] transport=edge')
  }

  const invoke = input.invoke ?? defaultInvoke
  const sessionWeddingId =
    input.sessionContext?.weddingId ??
    (workingContext.activeResource?.kind === 'wedding'
      ? workingContext.activeResource.id
      : null)
  const payload = buildEdgeInterpretationPayload({
    utterance: input.userText,
    pageContext: input.pageContext,
    sessionContext: {
      weddingId: sessionWeddingId,
    },
    recentUtterances: input.recentUtterances,
    workingContext: buildModelWorkingContext(workingContext),
  })

  if (input.signal?.aborted) {
    return {
      response: { kind: 'error', message: ASSISTANT_API_FAILURE },
      contextPatch: {},
    }
  }

  const edge = await invokeEdgeSemantic(payload, invoke)

  if (edge.status === 'error') {
    return {
      response: { kind: 'error', message: edge.message || ASSISTANT_API_FAILURE },
      contextPatch: {},
    }
  }

  if (edge.status === 'domain') {
    const validated = validateAssistantDomainRequest(edge.request)
    if (!validated) {
      return {
        response: { kind: 'error', message: ASSISTANT_API_FAILURE },
        contextPatch: {},
      }
    }
    return executeAssistantDomainRequest({
      domain: validated,
      pageContext: input.pageContext,
      sessionContext: { weddingId: sessionWeddingId },
      workingContext,
      sourceText: input.userText,
    })
  }

  if (edge.status === 'semantic') {
    const validated = validateAssistantSemanticRequest(edge.request)
    if (!validated) {
      return {
        response: { kind: 'error', message: ASSISTANT_API_FAILURE },
        contextPatch: {},
      }
    }
    if (import.meta.env?.DEV && edge.diagnostics?.usage) {
      console.info('[assistant] edge usage', edge.diagnostics.usage)
    }
    // Also accept domain-shaped object mistakenly under semantic
    const asDomain = validateAssistantDomainRequest(edge.request)
    if (asDomain && asDomain.kind !== 'direct') {
      return executeAssistantDomainRequest({
        domain: asDomain,
        pageContext: input.pageContext,
        sessionContext: { weddingId: sessionWeddingId },
        workingContext,
        sourceText: input.userText,
      })
    }
    return executeAssistantDomainRequest({
      domain: { kind: 'direct', semantic: validated },
      pageContext: input.pageContext,
      sessionContext: { weddingId: sessionWeddingId },
      workingContext,
      sourceText: input.userText,
    })
  }

  if (edge.status === 'final') {
    return {
      response: normalizeFinalResponse(edge.response),
      contextPatch: {},
    }
  }

  return {
    response: { kind: 'error', message: ASSISTANT_API_FAILURE },
    contextPatch: {},
  }
}

function normalizeFinalResponse(response: AssistantResponse): AssistantResponse {
  if (!response || typeof response !== 'object' || !('kind' in response)) {
    return { kind: 'error', message: ASSISTANT_API_FAILURE }
  }
  if (response.kind === 'unsupported' && !response.message) {
    return { kind: 'unsupported', message: ASSISTANT_UNSUPPORTED }
  }
  return response
}

/** Confirm create wedding — canonical mutation payload only. */
export function buildCreateWeddingInput(prepared: {
  partner1: string
  partner2: string
  date: string
}) {
  return {
    partner1: prepared.partner1.trim(),
    partner2: prepared.partner2.trim(),
    date: prepared.date,
    packageName: '',
    price: 0,
    depositPaid: false,
  }
}
