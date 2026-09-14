/**
 * Assistant V3 conversation state — extends V2 working context.
 * Ephemeral only. Never persist.
 */

import type {
  AssistantLastDirectContext,
  AssistantParticipantCandidate,
  AssistantParticipantKey,
} from '../api/participants'
import type {
  AssistantCollectionFilters,
  AssistantCollectionResource,
  AssistantSortField,
} from '../api/workingContext'

export type AssistantDiscourseFocus = {
  resourceRef?: string | null
  weddingId?: string | null
  participantKey?: AssistantParticipantKey | null
  placeScope?:
    | 'preparations'
    | 'bride_preparation'
    | 'groom_preparation'
    | 'ceremony'
    | 'reception'
    | 'all'
    | null
  /** Opaque place ref for "daleko tam mam?" */
  placeRef?: string | null
  dayPlanStage?: string | null
  financeAspect?: 'remaining' | 'paid' | 'contract_value' | 'overview' | null
  temporalAnchor?: string | null
  sequenceKind?: 'day_plan' | 'schedule' | null
} | null

export type AssistantLastResolvedRequest = {
  goalType:
    | 'places'
    | 'day_plan'
    | 'finances'
    | 'route'
    | 'tasks'
    | 'next_action'
    | 'schedule'
    | 'collection'
    | 'open'
    | 'prepare_write'
    | 'other'
  placeScope?: AssistantDiscourseFocus extends infer D
    ? D extends { placeScope?: infer S }
      ? S
      : never
    : never
  participantKey?: AssistantParticipantKey | null
  financeAspect?: 'remaining' | 'paid' | 'contract_value' | 'overview' | null
  dayPlanFocus?: 'ceremony' | 'preparations' | 'full' | 'earliest' | null
  capabilities?: string[]
} | null

export type AssistantPendingCorrection = {
  /** Original goal awaiting a slot repair. */
  goalType:
    | 'places'
    | 'day_plan'
    | 'finances'
    | 'route'
    | 'tasks'
    | 'next_action'
    | 'schedule'
    | 'collection'
    | 'open'
    | 'prepare_write'
    | 'other'
  missingSlot: 'participant' | 'date' | 'placeScope' | 'financeAspect' | 'resource'
  placeScope?: string | null
  dayPlanFocus?: string | null
  financeAspect?: string | null
  weddingId?: string | null
} | null

export type AssistantConversationState = {
  activeResource: {
    kind: 'wedding' | 'session'
    id: string
    displayLabel: string
    participants?: AssistantParticipantCandidate[]
  } | null

  activeCollection: {
    resource: AssistantCollectionResource
    filters: AssistantCollectionFilters
    memberIds?: string[]
    resultCount: number
    label?: string
  } | null

  lastOperation: {
    type: 'count' | 'sum' | 'min' | 'max' | 'list' | 'direct' | 'plan'
    field?: AssistantSortField
    scalarValue?: number
  } | null

  activeParticipant: {
    weddingId: string
    participantKey: AssistantParticipantKey
    displayLabel: string
  } | null

  lastDirectContext: AssistantLastDirectContext | null

  discourseFocus: AssistantDiscourseFocus

  lastResolvedRequest: AssistantLastResolvedRequest

  lastPlanSummary: {
    capabilities: string[]
    resolvedRefs: string[]
  } | null

  pendingClarification: {
    question: string
    options: Array<{
      id: string
      label: string
      resumePlan?: unknown
      resumeSemantic?: unknown
    }>
  } | null

  pendingCorrection: AssistantPendingCorrection
}

export function emptyConversationState(): AssistantConversationState {
  return {
    activeResource: null,
    activeCollection: null,
    lastOperation: null,
    activeParticipant: null,
    lastDirectContext: null,
    discourseFocus: null,
    lastResolvedRequest: null,
    lastPlanSummary: null,
    pendingClarification: null,
    pendingCorrection: null,
  }
}

export type ConversationStatePatch = Partial<AssistantConversationState>

export function applyConversationStatePatch(
  prev: AssistantConversationState,
  patch: ConversationStatePatch,
): AssistantConversationState {
  return {
    activeResource:
      patch.activeResource !== undefined
        ? patch.activeResource
        : prev.activeResource,
    activeCollection:
      patch.activeCollection !== undefined
        ? patch.activeCollection
        : prev.activeCollection,
    lastOperation:
      patch.lastOperation !== undefined
        ? patch.lastOperation
        : prev.lastOperation,
    activeParticipant:
      patch.activeParticipant !== undefined
        ? patch.activeParticipant
        : prev.activeParticipant,
    lastDirectContext:
      patch.lastDirectContext !== undefined
        ? patch.lastDirectContext
        : prev.lastDirectContext,
    discourseFocus:
      patch.discourseFocus !== undefined
        ? patch.discourseFocus
        : prev.discourseFocus,
    lastResolvedRequest:
      patch.lastResolvedRequest !== undefined
        ? patch.lastResolvedRequest
        : prev.lastResolvedRequest,
    lastPlanSummary:
      patch.lastPlanSummary !== undefined
        ? patch.lastPlanSummary
        : prev.lastPlanSummary,
    pendingClarification:
      patch.pendingClarification !== undefined
        ? patch.pendingClarification
        : prev.pendingClarification,
    pendingCorrection:
      patch.pendingCorrection !== undefined
        ? patch.pendingCorrection
        : prev.pendingCorrection,
  }
}

/** Bounded planner-facing state — no CRM rows. */
export function buildModelConversationState(
  state: AssistantConversationState,
): Record<string, unknown> {
  return {
    activeResource: state.activeResource
      ? {
          kind: state.activeResource.kind,
          id: state.activeResource.id,
          displayLabel: state.activeResource.displayLabel,
          participants: state.activeResource.participants?.map((p) => ({
            key: p.key,
            canonicalName: p.canonicalName,
            firstName: p.firstName,
            role: p.role,
          })),
        }
      : null,
    activeCollection: state.activeCollection
      ? {
          resource: state.activeCollection.resource,
          resultCount: state.activeCollection.resultCount,
          label: state.activeCollection.label ?? null,
          filters: {
            dateRange: state.activeCollection.filters.dateRange ?? null,
            paymentState: state.activeCollection.filters.paymentState ?? null,
          },
        }
      : null,
    activeParticipant: state.activeParticipant,
    discourseFocus: state.discourseFocus,
    lastResolvedRequest: state.lastResolvedRequest,
    lastPlanSummary: state.lastPlanSummary
      ? { capabilities: state.lastPlanSummary.capabilities }
      : null,
    pendingCorrection: state.pendingCorrection
      ? {
          goalType: state.pendingCorrection.goalType,
          missingSlot: state.pendingCorrection.missingSlot,
          placeScope: state.pendingCorrection.placeScope ?? null,
          weddingId: state.pendingCorrection.weddingId ?? null,
        }
      : null,
    lastDirectContext: state.lastDirectContext,
  }
}
