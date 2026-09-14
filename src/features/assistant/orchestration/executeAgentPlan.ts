/**
 * Assistant V3 — validate + execute bounded agent plans via capability registry.
 * Adapts to existing semantic / QueryPlan executors. No CRM to model.
 */

import { getNextDayPlanStage } from '../capabilities/dayPlanCapabilities'
import {
  calculateAssistantRoute,
  formatRouteDistanceAnswer,
} from '../capabilities/routeCapabilities'
import {
  ASSISTANT_API_FAILURE,
  ASSISTANT_DAY_PLAN_SEQUENCE_END,
  ASSISTANT_PARTICIPANT_NOT_FOUND,
  ASSISTANT_SEQUENCE_NO_CONTEXT,
} from '../copy'
import type { AssistantCapabilityName } from '../orchestration/capabilityRegistry'
import { getCapability } from '../orchestration/capabilityRegistry'
import type {
  AssistantConversationState,
  ConversationStatePatch,
} from '../orchestration/conversationState'
import { AssistantRefStore } from '../orchestration/refs'
import type {
  AssistantAgentPlan,
  AssistantPlanStep,
} from '../orchestration/validateAgentPlan'
import { validateAssistantAgentPlan } from '../orchestration/validateAgentPlan'
import type {
  AssistantResponse,
  AssistantSemanticRequest,
  PageContextHint,
  PlaceRoleFilter,
} from '../types'
import { executeAssistantQueryPlan } from '../api/executeQueryPlan'
import { executeAssistantSemanticRequest } from '../api/executeSemantic'
import { refineSemanticRequestFromUtterance } from '../api/intentParse'
import {
  participantsFromCouple,
  placeRoleForParticipant,
  type AssistantParticipantKey,
} from '../api/participants'
import { validateAssistantQueryPlan } from '../api/queryPlanSchema'
import type { AssistantWorkingContext, WorkingContextPatch } from '../api/workingContext'
import { weddingPlaceService } from '@/lib/api/weddingPlaceService'

export type AgentPlanTrace = {
  plannerKind: 'plan'
  capabilities: string[]
  validationOk: boolean
  executed: Array<{ capability: string; ms: number; ok: boolean }>
  clarificationReason?: string
  unsupportedReason?: string
  provenance: string[]
}

export type ExecuteAgentPlanResult = {
  response: AssistantResponse
  contextPatch: WorkingContextPatch
  conversationPatch?: ConversationStatePatch
  trace?: AgentPlanTrace
  provenance: string[]
}

type StepObservation = {
  stepId: string
  capability: AssistantCapabilityName
  /** Model-safe observation — no addresses/money rows. */
  observation: Record<string, unknown>
  /** Client-only payload for composition. */
  private?: Record<string, unknown>
}

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

function resolveWeddingIdFromInput(
  input: Record<string, unknown>,
  refs: AssistantRefStore,
  workingContext: AssistantWorkingContext,
  observations: StepObservation[],
): string | null {
  const weddingRef = asString(input.weddingRef)
  if (weddingRef) {
    const e = refs.resolve(weddingRef)
    if (e?.kind === 'wedding') return e.entityId
  }
  const weddingId = asString(input.weddingId)
  if (weddingId && /^[0-9a-f-]{36}$/i.test(weddingId)) {
    // Only accept if minted or active
    if (workingContext.activeResource?.id === weddingId) return weddingId
    for (const obs of observations) {
      if (obs.private?.weddingId === weddingId) return weddingId
      if (asString(obs.observation.weddingId) === weddingId) return weddingId
    }
    // search may have returned this id into refs
    for (const token of ['w_1', 'w_2', 'w_3', 'w_4', 'w_5', 'w_6']) {
      const e = refs.resolve(token)
      if (e?.kind === 'wedding' && e.entityId === weddingId) return weddingId
    }
  }
  // dependency: use last wedding from prior step
  const depWedding = [...observations]
    .reverse()
    .find((o) => typeof o.private?.weddingId === 'string')
  if (depWedding) return depWedding.private!.weddingId as string

  if (workingContext.activeResource?.kind === 'wedding') {
    return workingContext.activeResource.id
  }
  return null
}

function capabilityToSemantic(
  capability: AssistantCapabilityName,
  input: Record<string, unknown>,
  weddingId: string | null,
): AssistantSemanticRequest | null {
  const personQuery = asString(input.personQuery)
  const dateHint = asString(input.dateHint) ?? asString(input.datePhrase)
  const resolver = {
    personQuery,
    dateHint,
    weddingId,
  }
  const participantKeyRaw = asString(input.participantKey)
  const participantKey =
    participantKeyRaw === 'p1' || participantKeyRaw === 'p2'
      ? participantKeyRaw
      : null
  const participantRoleRaw = asString(input.participantRole)
  const participantRole =
    participantRoleRaw === 'bride' || participantRoleRaw === 'groom'
      ? participantRoleRaw
      : null

  switch (capability) {
    case 'search_weddings':
    case 'get_wedding_context':
      return { kind: 'open_wedding', resolver }
    case 'get_wedding_participants':
      return { kind: 'open_wedding', resolver }
    case 'get_wedding_places': {
      const scope =
        (asString(input.scope) as PlaceRoleFilter | null) ??
        (asString(input.requestedRole) as PlaceRoleFilter | null) ??
        'all'
      return {
        kind: 'wedding_places',
        resolver,
        requestedRole: scope,
        participantKey,
        participantRole,
      }
    }
    case 'get_wedding_day_plan': {
      const focusRaw = asString(input.focus)
      const focus =
        focusRaw === 'ceremony' ||
        focusRaw === 'preparations' ||
        focusRaw === 'full' ||
        focusRaw === 'earliest'
          ? focusRaw
          : 'full'
      return {
        kind: 'wedding_day_plan',
        resolver,
        focus,
        participantKey,
        participantRole,
      }
    }
    case 'get_wedding_finances': {
      const aspectRaw = asString(input.financeAspect) ?? asString(input.aspect)
      const financeAspect =
        aspectRaw === 'remaining' ||
        aspectRaw === 'paid' ||
        aspectRaw === 'contract_value' ||
        aspectRaw === 'overview'
          ? aspectRaw
          : 'overview'
      return { kind: 'wedding_finances', resolver, financeAspect }
    }
    case 'get_wedding_tasks':
      return { kind: 'wedding_tasks', resolver }
    case 'get_wedding_next_action':
      return { kind: 'wedding_next_action', resolver }
    case 'get_schedule': {
      const datePhrase = asString(input.datePhrase) ?? 'dziś'
      return { kind: 'schedule', datePhrase }
    }
    case 'search_sessions':
      return {
        kind: 'open_session',
        resolver: { personQuery, sessionId: asString(input.sessionId) },
      }
    case 'prepare_create_wedding': {
      const partner1 = asString(input.partner1)
      const partner2 = asString(input.partner2)
      const date = asString(input.date)
      if (!partner1 || !partner2 || !date) return null
      return { kind: 'prepare_create_wedding', partner1, partner2, date }
    }
    case 'prepare_create_task': {
      const title = asString(input.title)
      if (!title) return null
      return {
        kind: 'prepare_create_task',
        title,
        duePhrase: asString(input.duePhrase),
        weddingQuery: asString(input.weddingQuery),
        weddingId,
      }
    }
    default:
      return null
  }
}

function patchFromResponse(
  response: AssistantResponse,
  capabilities: string[],
): WorkingContextPatch & { conversationExtras?: ConversationStatePatch } {
  const base: WorkingContextPatch = {}
  const conversationExtras: ConversationStatePatch = {
    lastPlanSummary: {
      capabilities,
      resolvedRefs: [],
    },
  }

  if (response.kind === 'places') {
    const participants = participantsFromCouple({
      partner1: response.wedding.partner1,
      partner2: response.wedding.partner2,
    })
    const focus = response.focusRole
    let participantKey: AssistantParticipantKey | null =
      response.places.length === 1
        ? response.places[0]?.participantKey ?? null
        : null
    if (
      participantKey &&
      !participants.some((p) => p.key === participantKey)
    ) {
      participantKey = null
    }
    base.activeResource = {
      kind: 'wedding',
      id: response.wedding.id,
      displayLabel: response.wedding.displayName,
      participants,
    }
    base.activeParticipant =
      participantKey != null
        ? {
            weddingId: response.wedding.id,
            participantKey,
            displayLabel:
              participants.find((p) => p.key === participantKey)
                ?.canonicalName ?? participantKey,
          }
        : null
    base.lastDirectContext = {
      intent: 'wedding_places',
      placeScope:
        focus === 'bride_preparation' ||
        focus === 'groom_preparation' ||
        focus === 'preparations' ||
        focus === 'ceremony' ||
        focus === 'reception' ||
        focus === 'all'
          ? focus
          : 'all',
      participantKey,
    }
    base.lastOperation = { type: 'plan' }
    conversationExtras.discourseFocus = {
      weddingId: response.wedding.id,
      participantKey,
      placeScope:
        focus === 'all' || !focus
          ? null
          : (focus as NonNullable<
              NonNullable<
                AssistantConversationState['discourseFocus']
              >['placeScope']
            >),
      placeRef:
        focus === 'all' || response.places.length !== 1 ? null : undefined,
    }
    conversationExtras.lastResolvedRequest = {
      goalType: 'places',
      placeScope:
        (focus as AssistantConversationState['lastResolvedRequest'] extends {
          placeScope?: infer S
        }
          ? S
          : never) ?? null,
      participantKey,
      capabilities,
    }
    conversationExtras.pendingCorrection = null
  }

  if (response.kind === 'text' && capabilities.includes('calculate_route')) {
    conversationExtras.lastResolvedRequest = {
      goalType: 'route',
      capabilities,
    }
  }

  if (response.kind === 'day_plan') {
    conversationExtras.lastResolvedRequest = {
      goalType: 'day_plan',
      dayPlanFocus: response.focus ?? 'full',
      capabilities,
    }
    base.lastDirectContext = {
      intent: 'wedding_day_plan',
      dayPlanFocus: response.focus ?? 'full',
    }
    base.activeResource = {
      kind: 'wedding',
      id: response.wedding.id,
      displayLabel: response.wedding.displayName,
      participants: participantsFromCouple({
        partner1: response.wedding.partner1,
        partner2: response.wedding.partner2,
      }),
    }
  }

  if (response.kind === 'error' && response.message === ASSISTANT_PARTICIPANT_NOT_FOUND) {
    conversationExtras.pendingCorrection = {
      goalType: 'places',
      missingSlot: 'participant',
      placeScope: 'preparations',
      weddingId: base.activeResource?.id ?? null,
    }
  }

  return { ...base, conversationExtras }
}

async function mintPlaceRefsForWedding(
  weddingId: string,
  refs: AssistantRefStore,
  role?: string | null,
  participantKey?: AssistantParticipantKey | null,
): Promise<{ placeRef: string; role: string; label: string } | null> {
  const places = await weddingPlaceService.listByWeddingId(weddingId)
  let target = places
  if (role === 'preparations' && participantKey) {
    const prepRole = placeRoleForParticipant(participantKey)
    target = places.filter(
      (p) =>
        p.role === prepRole ||
        (prepRole === 'bride_preparation' && p.role === 'preparation'),
    )
  } else if (role && role !== 'all' && role !== 'preparations') {
    target = places.filter((p) => p.role === role)
  }
  const place = target[0]
  if (!place) return null
  const token = refs.mint('place', place.id, {
    weddingId,
    displayLabel: place.label || place.formattedAddress || place.role,
    role: place.role,
    participantKey:
      place.role === 'groom_preparation'
        ? 'p2'
        : place.role === 'bride_preparation' || place.role === 'preparation'
          ? 'p1'
          : null,
  })
  return {
    placeRef: token,
    role: place.role,
    label: place.label || place.formattedAddress || 'miejsca',
  }
}

export async function executeAssistantAgentPlan(input: {
  plan: AssistantAgentPlan
  pageContext?: PageContextHint | null
  sessionContext?: { weddingId?: string | null } | null
  workingContext: AssistantWorkingContext
  conversationState?: AssistantConversationState | null
  sourceText?: string | null
  signal?: AbortSignal
  refs?: AssistantRefStore
}): Promise<ExecuteAgentPlanResult> {
  const refs = input.refs ?? new AssistantRefStore()
  const provenance: string[] = []
  const executed: AgentPlanTrace['executed'] = []
  const observations: StepObservation[] = []
  let lastResponse: AssistantResponse | null = null
  let mergedPatch: WorkingContextPatch = {}

  for (const step of input.plan.steps) {
    if (input.signal?.aborted) {
      return {
        response: { kind: 'error', message: ASSISTANT_API_FAILURE },
        contextPatch: {},
        provenance,
        trace: {
          plannerKind: 'plan',
          capabilities: input.plan.steps.map((s) => s.capability),
          validationOk: true,
          executed,
          provenance,
        },
      }
    }

    const def = getCapability(step.capability)
    if (!def) {
      return {
        response: {
          kind: 'error',
          message:
            'Nie udało mi się pewnie zrozumieć tego pytania. Spróbuj napisać je trochę inaczej.',
        },
        contextPatch: {},
        provenance,
      }
    }

    const t0 = Date.now()
    const result = await executeOneStep({
      step,
      refs,
      workingContext: {
        ...input.workingContext,
        ...mergedPatch,
        activeResource:
          mergedPatch.activeResource !== undefined
            ? mergedPatch.activeResource
            : input.workingContext.activeResource,
      },
      pageContext: input.pageContext,
      sessionContext: input.sessionContext,
      observations,
      sourceText: input.sourceText,
    })
    executed.push({
      capability: step.capability,
      ms: Date.now() - t0,
      ok: result.ok,
    })
    provenance.push(...result.provenance)
    observations.push(result.observation)

    if (!result.ok) {
      return {
        response: result.response,
        contextPatch: { ...mergedPatch, ...result.patch },
        conversationPatch: result.conversationPatch,
        provenance,
        trace: {
          plannerKind: 'plan',
          capabilities: input.plan.steps.map((s) => s.capability),
          validationOk: true,
          executed,
          unsupportedReason: result.unsupportedReason,
          provenance,
        },
      }
    }

    lastResponse = result.response
    mergedPatch = { ...mergedPatch, ...result.patch }

    // Stop after prepare_write or user-facing terminal shapes
    if (
      def.mode === 'prepare_write' ||
      result.response.kind === 'choice' ||
      result.response.kind === 'clarification' ||
      result.response.kind === 'confirmation' ||
      result.response.kind === 'unsupported'
    ) {
      break
    }
  }

  if (!lastResponse) {
    return {
      response: {
        kind: 'error',
        message:
          'Nie udało mi się pewnie zrozumieć tego pytania. Spróbuj napisać je trochę inaczej.',
      },
      contextPatch: {},
      provenance,
    }
  }

  const extras = patchFromResponse(
    lastResponse,
    input.plan.steps.map((s) => s.capability),
  )
  const { conversationExtras, ...ctxPatch } = extras

  return {
    response: lastResponse,
    contextPatch: { ...mergedPatch, ...ctxPatch },
    conversationPatch: conversationExtras,
    provenance,
    trace:
      import.meta.env?.DEV
        ? {
            plannerKind: 'plan',
            capabilities: input.plan.steps.map((s) => s.capability),
            validationOk: true,
            executed,
            provenance,
          }
        : undefined,
  }
}

async function executeOneStep(ctx: {
  step: AssistantPlanStep
  refs: AssistantRefStore
  workingContext: AssistantWorkingContext
  pageContext?: PageContextHint | null
  sessionContext?: { weddingId?: string | null } | null
  observations: StepObservation[]
  sourceText?: string | null
}): Promise<{
  ok: boolean
  response: AssistantResponse
  patch: WorkingContextPatch
  conversationPatch?: ConversationStatePatch
  observation: StepObservation
  provenance: string[]
  unsupportedReason?: string
}> {
  const { step, refs, workingContext, observations } = ctx
  const weddingId = resolveWeddingIdFromInput(
    step.input,
    refs,
    workingContext,
    observations,
  )

  if (step.capability === 'collection_query') {
    const planRaw = step.input.plan ?? step.input
    const plan = validateAssistantQueryPlan(
      planRaw && typeof planRaw === 'object'
        ? { kind: 'query_plan', ...(planRaw as object) }
        : null,
    )
    if (!plan) {
      return failStep(
        step,
        {
          kind: 'error',
          message:
            'Nie udało mi się pewnie zrozumieć tego pytania. Spróbuj napisać je trochę inaczej.',
        },
        'planner_invalid',
      )
    }
    const run = await executeAssistantQueryPlan({
      plan,
      workingContext,
    })
    return {
      ok: true,
      response: run.response,
      patch: run.contextPatch,
      observation: {
        stepId: step.id,
        capability: step.capability,
        observation: {
          kind: run.response.kind,
          resultCount:
            run.response.kind === 'collection'
              ? run.response.resultCount
              : run.response.kind === 'scalar'
                ? run.response.value
                : null,
        },
        private: {},
      },
      provenance: ['collection_query'],
    }
  }

  if (step.capability === 'calculate_route') {
    const originKind = asString(step.input.originKind) ?? 'studio_start'
    const destinationRef =
      asString(step.input.destinationRef) ??
      asString(step.input.placeRef) ??
      (() => {
        const prior = [...observations]
          .reverse()
          .find((o) => typeof o.private?.placeRef === 'string')
        return prior ? (prior.private!.placeRef as string) : null
      })()

    let destRole =
      (asString(step.input.destinationRole) as
        | 'bride_preparation'
        | 'groom_preparation'
        | 'ceremony'
        | 'reception'
        | null) ?? null
    const participantKey =
      asString(step.input.participantKey) === 'p1' ||
      asString(step.input.participantKey) === 'p2'
        ? (asString(step.input.participantKey) as AssistantParticipantKey)
        : workingContext.activeParticipant?.participantKey ?? null

    if (!destinationRef && !destRole && weddingId) {
      const scope =
        workingContext.lastDirectContext?.placeScope ??
        (participantKey ? 'preparations' : null)
      if (scope === 'preparations' && participantKey) {
        destRole = placeRoleForParticipant(participantKey)
      } else if (
        scope === 'ceremony' ||
        scope === 'reception' ||
        scope === 'bride_preparation' ||
        scope === 'groom_preparation'
      ) {
        destRole = scope
      }
    }

    // Ensure place ref exists for destination
    let placeRef = destinationRef
    let destLabel = 'tego miejsca'
    if (weddingId && (placeRef || destRole || participantKey)) {
      const minted = await mintPlaceRefsForWedding(
        weddingId,
        refs,
        destRole ??
          (participantKey ? placeRoleForParticipant(participantKey) : null),
        participantKey,
      )
      if (minted) {
        placeRef = placeRef ?? minted.placeRef
        destLabel =
          participantKey === 'p1'
            ? 'przygotowań panny młodej'
            : participantKey === 'p2'
              ? 'przygotowań pana młodego'
              : destRole === 'ceremony'
                ? 'ceremonii'
                : destRole === 'reception'
                  ? 'wesela'
                  : `przygotowań`
        if (workingContext.activeParticipant?.displayLabel) {
          const first =
            workingContext.activeParticipant.displayLabel.split(/\s+/)[0]
          if (first && (destRole?.includes('preparation') || participantKey)) {
            destLabel = `przygotowań ${first}`
          }
        }
      }
    }

    const route = await calculateAssistantRoute(
      {
        origin:
          originKind === 'studio_start' || !asString(step.input.originRef)
            ? { kind: 'studio_start' }
            : {
                kind: 'place_ref',
                placeRef: asString(step.input.originRef)!,
              },
        destinationRef: placeRef,
        weddingId,
        destinationRole: destRole,
      },
      refs,
    )

    if (!route.ok) {
      return {
        ok: false,
        response: { kind: 'error', message: route.message },
        patch: {},
        observation: {
          stepId: step.id,
          capability: step.capability,
          observation: { routeComplete: false, reason: route.reason },
        },
        provenance: route.provenance,
        unsupportedReason: route.reason,
      }
    }

    const message = formatRouteDistanceAnswer({
      distanceKm: route.distanceKm,
      durationMinutes: route.durationMinutes,
      destinationLabel: destLabel,
      fromStudio: originKind === 'studio_start',
    })

    return {
      ok: true,
      response: {
        kind: 'route_distance',
        message,
        distanceKm: route.distanceKm,
        durationMinutes: route.durationMinutes,
        destinationLabel: destLabel,
        fromStudio: originKind === 'studio_start',
        provenance: route.provenance,
      } as AssistantResponse,
      patch: {
        lastOperation: { type: 'direct' },
        lastDirectContext: {
          intent: 'wedding_places',
          placeScope:
            workingContext.lastDirectContext?.placeScope ?? 'preparations',
          participantKey,
        },
      },
      conversationPatch: {
        discourseFocus: {
          weddingId: weddingId ?? null,
          placeRef: placeRef ?? null,
          participantKey,
          placeScope:
            workingContext.lastDirectContext?.placeScope ?? 'preparations',
        },
        lastResolvedRequest: {
          goalType: 'route',
          participantKey,
          capabilities: ['calculate_route'],
        },
      },
      observation: {
        stepId: step.id,
        capability: step.capability,
        observation: {
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          routeComplete: true,
        },
        private: { placeRef, weddingId },
      },
      provenance: route.provenance,
    }
  }

  if (step.capability === 'get_next_day_plan_stage') {
    if (!weddingId) {
      return failStep(step, {
        kind: 'error',
        message: ASSISTANT_SEQUENCE_NO_CONTEXT,
      })
    }
    const fromRaw =
      asString(step.input.fromStage) ??
      asString(step.input.afterStage) ??
      workingContext.discourseFocus?.dayPlanStage ??
      workingContext.lastDirectContext?.placeScope ??
      'preparations'
    const fromStage =
      fromRaw === 'ceremony' ||
      fromRaw === 'reception' ||
      fromRaw === 'bride_preparation' ||
      fromRaw === 'groom_preparation' ||
      fromRaw === 'preparations' ||
      fromRaw === 'preparation'
        ? fromRaw === 'preparation'
          ? 'bride_preparation'
          : fromRaw
        : 'preparations'
    const participantKey =
      asString(step.input.participantKey) === 'p1' ||
      asString(step.input.participantKey) === 'p2'
        ? (asString(step.input.participantKey) as AssistantParticipantKey)
        : workingContext.discourseFocus?.participantKey ??
          workingContext.activeParticipant?.participantKey ??
          null

    const next = await getNextDayPlanStage({
      weddingId,
      fromStage,
      participantKey,
    })
    if (!next.ok) {
      const endMessage =
        next.reason === 'no_next'
          ? ASSISTANT_DAY_PLAN_SEQUENCE_END
          : next.message
      // End-of-sequence is a successful conversational answer
      if (next.reason === 'no_next') {
        return {
          ok: true,
          response: { kind: 'text', message: endMessage },
          patch: {
            lastOperation: { type: 'direct' },
          },
          conversationPatch: {
            discourseFocus: {
              ...(workingContext.discourseFocus ?? {}),
              weddingId,
              dayPlanStage:
                workingContext.discourseFocus?.dayPlanStage ?? fromStage,
              sequenceKind: 'day_plan',
            },
            lastResolvedRequest: {
              goalType: 'day_plan',
              capabilities: ['get_next_day_plan_stage'],
            },
          },
          observation: {
            stepId: step.id,
            capability: step.capability,
            observation: { reason: next.reason, atEnd: true },
          },
          provenance: next.provenance,
        }
      }
      return {
        ok: false,
        response: { kind: 'error', message: endMessage },
        patch: {},
        observation: {
          stepId: step.id,
          capability: step.capability,
          observation: { reason: next.reason },
        },
        provenance: next.provenance,
      }
    }

    const placeLabel = next.next.placeName || next.next.title
    const message = `Potem: ${next.next.title}${
      placeLabel && placeLabel !== next.next.title ? ` — ${placeLabel}` : ''
    }${next.next.time ? ` o ${next.next.time}` : ''}.`

    return {
      ok: true,
      response: {
        kind: 'text',
        message,
      },
      patch: {
        activeResource: {
          kind: 'wedding',
          id: next.wedding.id,
          displayLabel: next.wedding.displayName,
          participants: participantsFromCouple({
            partner1: next.wedding.partner1,
            partner2: next.wedding.partner2,
          }),
        },
        lastDirectContext: {
          intent: 'wedding_day_plan',
          dayPlanFocus: 'full',
          placeScope:
            next.next.role === 'ceremony' ||
            next.next.role === 'reception' ||
            next.next.role === 'bride_preparation' ||
            next.next.role === 'groom_preparation'
              ? next.next.role
              : workingContext.lastDirectContext?.placeScope,
        },
        lastOperation: { type: 'direct' },
      },
      conversationPatch: {
        discourseFocus: {
          weddingId,
          dayPlanStage: next.next.role,
          sequenceKind: 'day_plan',
          participantKey,
          placeScope:
            next.next.role === 'ceremony' || next.next.role === 'reception'
              ? next.next.role
              : next.next.role === 'bride_preparation' ||
                  next.next.role === 'groom_preparation'
                ? next.next.role
                : null,
        },
        lastResolvedRequest: {
          goalType: 'day_plan',
          capabilities: ['get_next_day_plan_stage'],
        },
      },
      observation: {
        stepId: step.id,
        capability: step.capability,
        observation: {
          nextRole: next.next.role,
          nextTitle: next.next.title,
          textHint: message,
        },
        private: {
          weddingId,
          placeId: next.next.placeId,
        },
      },
      provenance: next.provenance,
    }
  }

  // Adapter → existing semantic (refine role/focus from utterance)
  const rawSemantic = capabilityToSemantic(
    step.capability,
    step.input,
    weddingId,
  )
  if (!rawSemantic) {
    return failStep(step, {
      kind: 'unsupported',
      message: 'Tej akcji nie można jeszcze wykonać przez Zapytaj OurWed.',
    }, 'capability')
  }
  const semantic = refineSemanticRequestFromUtterance(
    rawSemantic,
    ctx.sourceText,
  )

  const response = await executeAssistantSemanticRequest({
    request: semantic,
    pageContext: ctx.pageContext,
    sessionContext: {
      weddingId:
        weddingId ??
        ctx.sessionContext?.weddingId ??
        (workingContext.activeResource?.kind === 'wedding'
          ? workingContext.activeResource.id
          : null),
    },
    sourceText: ctx.sourceText,
  })

  // Mint wedding + place refs from places response
  let privateData: Record<string, unknown> = {}
  if (response.kind === 'places') {
    const wRef = refs.mint('wedding', response.wedding.id, {
      displayLabel: response.wedding.displayName,
      date: response.wedding.date,
    })
    privateData = { weddingId: response.wedding.id, weddingRef: wRef }
    if (response.places.length === 1) {
      const minted = await mintPlaceRefsForWedding(
        response.wedding.id,
        refs,
        response.places[0]?.role,
        response.places[0]?.participantKey ?? null,
      )
      if (minted) privateData.placeRef = minted.placeRef
    }
  } else if (response.kind === 'wedding') {
    const wRef = refs.mint('wedding', response.wedding.id, {
      displayLabel: response.wedding.displayName,
      date: response.wedding.date,
    })
    privateData = { weddingId: response.wedding.id, weddingRef: wRef }
  } else if (response.kind === 'finance') {
    privateData = { weddingId: response.finance.weddingId }
  }

  const isFail =
    response.kind === 'error' || response.kind === 'unsupported'

  // Set pending correction when participant not found
  let conversationPatch: ConversationStatePatch | undefined
  if (
    response.kind === 'error' &&
    response.message === ASSISTANT_PARTICIPANT_NOT_FOUND
  ) {
    conversationPatch = {
      pendingCorrection: {
        goalType: 'places',
        missingSlot: 'participant',
        placeScope:
          semantic.kind === 'wedding_places'
            ? semantic.requestedRole
            : 'preparations',
        weddingId: weddingId ?? workingContext.activeResource?.id ?? null,
      },
    }
  }

  const terminalOk =
    response.kind === 'clarification' ||
    response.kind === 'choice' ||
    response.kind === 'confirmation' ||
    !isFail

  return {
    ok: terminalOk,
    response,
    patch: {},
    conversationPatch,
    observation: {
      stepId: step.id,
      capability: step.capability,
      observation: {
        responseKind: response.kind,
        weddingRef:
          typeof privateData.weddingRef === 'string'
            ? privateData.weddingRef
            : null,
        placeRef:
          typeof privateData.placeRef === 'string'
            ? privateData.placeRef
            : null,
      },
      private: privateData,
    },
    provenance: [step.capability],
  }
}

function failStep(
  step: AssistantPlanStep,
  response: AssistantResponse,
  unsupportedReason?: string,
): {
  ok: false
  response: AssistantResponse
  patch: WorkingContextPatch
  observation: StepObservation
  provenance: string[]
  unsupportedReason?: string
} {
  return {
    ok: false,
    response,
    patch: {},
    observation: {
      stepId: step.id,
      capability: step.capability,
      observation: { failed: true },
    },
    provenance: [step.capability],
    unsupportedReason,
  }
}

/** Parse + validate raw Edge plan payload. */
export function tryParseAgentPlan(raw: unknown): AssistantAgentPlan | null {
  return validateAssistantAgentPlan(raw)
}
