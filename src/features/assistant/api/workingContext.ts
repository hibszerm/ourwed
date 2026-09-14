/**
 * Ephemeral Assistant V2 / V2.1 working context — never persisted.
 */

import type {
  AssistantLastDirectContext,
  AssistantParticipantCandidate,
  AssistantParticipantKey,
} from './participants'
import { participantsForModel } from './participants'

export type AssistantCollectionResource = 'weddings' | 'sessions' | 'assignments'

export type AssistantPaymentState =
  | 'unpaid'
  | 'partial'
  | 'paid'
  | 'deposit_missing'

export type AssistantMoneyField =
  | 'contractValue'
  | 'paidAmount'
  | 'remainingAmount'

export type AssistantSortField = AssistantMoneyField | 'date'

export type AssistantRemainingComparator = {
  operator: 'gt' | 'gte' | 'lt' | 'lte'
  value: number
}

export type AssistantCollectionFilters = {
  dateRange?: { from: string; to: string }
  personQuery?: string | null
  locationQuery?: string | null
  /** Phase 3E — place-role family for venue matching (V4 collection). */
  locationRole?: 'preparations' | 'ceremony' | 'reception' | 'any' | null
  packageQuery?: string | null
  workflowStage?: string | null
  paymentState?: AssistantPaymentState | null
  remainingAmount?: AssistantRemainingComparator | null
  status?: 'active_archived' | 'active' | null
}

export type AssistantWorkingContext = {
  activeResource: {
    kind: 'wedding' | 'session'
    id: string
    displayLabel: string
    /** Identity-only participants when kind=wedding. */
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

  /** Ephemeral participant focus within active wedding. */
  activeParticipant: {
    weddingId: string
    participantKey: AssistantParticipantKey
    displayLabel: string
  } | null

  /** Last direct semantic scope for ellipsis follow-ups ("a Julia?"). */
  lastDirectContext: AssistantLastDirectContext | null

  /** Pending clarification → resume as domain request. */
  pendingClarification?: {
    /** Stable clarification turn id. */
    id?: string
    question: string
    options: Array<{
      id: string
      label: string
      resumePlan?: unknown
      resumeSemantic?: unknown
      semanticPatch?: {
        participantKey?: 'p1' | 'p2' | null
        participantRole?: 'bride' | 'groom' | null
        weddingId?: string | null
        sessionId?: string | null
        placeScope?: string | null
        datePhrase?: string | null
        financeAspect?: string | null
      } | null
    }>
    slot?:
      | 'participant'
      | 'resource'
      | 'assignment'
      | 'placeScope'
      | 'date'
      | 'financeAspect'
      | 'entity_type'
      | 'other'
    signature?: string
    depth?: number
    resolvedSlots?: string[]
    originalUtterance?: string | null
    goalType?: string | null
    /** Resume base semantic after option patch. */
    resumeSemantic?: unknown
  } | null

  /** Temporal discourse anchor e.g. resolved ISO date or phrase. */
  temporalAnchor?: {
    phrase: string
    from?: string | null
    to?: string | null
  } | null

  /** Clarification loop signatures seen this session goal. */
  clarificationHistory?: string[]

  /** V3: discourse focus for route / next-stage follow-ups. */
  discourseFocus?: {
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
    placeRef?: string | null
    dayPlanStage?: string | null
    financeAspect?: 'remaining' | 'paid' | 'contract_value' | 'overview' | null
    /** V3.1.1: sequence discourse kind when advancing day plan / schedule. */
    sequenceKind?: 'day_plan' | 'schedule' | null
  } | null

  /** V3: last resolved semantic goal for ellipsis / corrections. */
  lastResolvedRequest?: {
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
    placeScope?: string | null
    participantKey?: AssistantParticipantKey | null
    financeAspect?: string | null
    dayPlanFocus?: string | null
    capabilities?: string[]
  } | null

  /** V3: await slot repair after fail-closed unknown participant etc. */
  pendingCorrection?: {
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
    weddingId?: string | null
  } | null

  lastPlanSummary?: {
    capabilities: string[]
  } | null
}

export function emptyWorkingContext(): AssistantWorkingContext {
  return {
    activeResource: null,
    activeCollection: null,
    lastOperation: null,
    activeParticipant: null,
    lastDirectContext: null,
    pendingClarification: null,
    discourseFocus: null,
    lastResolvedRequest: null,
    pendingCorrection: null,
    lastPlanSummary: null,
    temporalAnchor: null,
    clarificationHistory: [],
  }
}

/** Bounded payload for Edge/model — no CRM rows / addresses / money. */
export function buildModelWorkingContext(
  ctx: AssistantWorkingContext,
): Record<string, unknown> {
  return {
    activeCollection: ctx.activeCollection
      ? {
          resource: ctx.activeCollection.resource,
          filters: {
            dateRange: ctx.activeCollection.filters.dateRange ?? null,
            personQuery: ctx.activeCollection.filters.personQuery ?? null,
            locationQuery: ctx.activeCollection.filters.locationQuery ?? null,
            locationRole: ctx.activeCollection.filters.locationRole ?? null,
            packageQuery: ctx.activeCollection.filters.packageQuery ?? null,
            workflowStage: ctx.activeCollection.filters.workflowStage ?? null,
            paymentState: ctx.activeCollection.filters.paymentState ?? null,
            remainingAmount: ctx.activeCollection.filters.remainingAmount ?? null,
          },
          resultCount: ctx.activeCollection.resultCount,
          label: ctx.activeCollection.label ?? null,
        }
      : null,
    activeResource: ctx.activeResource
      ? {
          kind: ctx.activeResource.kind,
          id: ctx.activeResource.id,
          displayLabel: ctx.activeResource.displayLabel,
          participants:
            ctx.activeResource.kind === 'wedding' &&
            ctx.activeResource.participants
              ? participantsForModel(ctx.activeResource.participants)
              : null,
        }
      : null,
    activeParticipant: ctx.activeParticipant
      ? {
          weddingId: ctx.activeParticipant.weddingId,
          participantKey: ctx.activeParticipant.participantKey,
          displayLabel: ctx.activeParticipant.displayLabel,
        }
      : null,
    lastDirectContext: ctx.lastDirectContext
      ? {
          intent: ctx.lastDirectContext.intent,
          placeScope: ctx.lastDirectContext.placeScope ?? null,
          participantKey: ctx.lastDirectContext.participantKey ?? null,
          dayPlanFocus: ctx.lastDirectContext.dayPlanFocus ?? null,
          financeAspect: ctx.lastDirectContext.financeAspect ?? null,
        }
      : null,
    lastOperation: ctx.lastOperation
      ? {
          type: ctx.lastOperation.type,
          field: ctx.lastOperation.field ?? null,
          scalarValue:
            typeof ctx.lastOperation.scalarValue === 'number'
              ? ctx.lastOperation.scalarValue
              : null,
        }
      : null,
    discourseFocus: ctx.discourseFocus ?? null,
    lastResolvedRequest: ctx.lastResolvedRequest
      ? {
          goalType: ctx.lastResolvedRequest.goalType,
          placeScope: ctx.lastResolvedRequest.placeScope ?? null,
          participantKey: ctx.lastResolvedRequest.participantKey ?? null,
          financeAspect: ctx.lastResolvedRequest.financeAspect ?? null,
          dayPlanFocus: ctx.lastResolvedRequest.dayPlanFocus ?? null,
          capabilities: ctx.lastResolvedRequest.capabilities ?? null,
        }
      : null,
    pendingCorrection: ctx.pendingCorrection
      ? {
          goalType: ctx.pendingCorrection.goalType,
          missingSlot: ctx.pendingCorrection.missingSlot,
          placeScope: ctx.pendingCorrection.placeScope ?? null,
          weddingId: ctx.pendingCorrection.weddingId ?? null,
        }
      : null,
    lastPlanSummary: ctx.lastPlanSummary
      ? { capabilities: ctx.lastPlanSummary.capabilities }
      : null,
    temporalAnchor: ctx.temporalAnchor
      ? {
          phrase: ctx.temporalAnchor.phrase,
          from: ctx.temporalAnchor.from ?? null,
          to: ctx.temporalAnchor.to ?? null,
        }
      : null,
    pendingClarification: ctx.pendingClarification
      ? {
          slot: ctx.pendingClarification.slot ?? null,
          goalType: ctx.pendingClarification.goalType ?? null,
          depth: ctx.pendingClarification.depth ?? 0,
          resolvedSlots: ctx.pendingClarification.resolvedSlots ?? [],
        }
      : null,
  }
}

export type WorkingContextPatch = Partial<AssistantWorkingContext>

export function applyWorkingContextPatch(
  prev: AssistantWorkingContext,
  patch: WorkingContextPatch,
): AssistantWorkingContext {
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
    pendingClarification:
      patch.pendingClarification !== undefined
        ? patch.pendingClarification
        : prev.pendingClarification,
    discourseFocus:
      patch.discourseFocus !== undefined
        ? patch.discourseFocus
        : prev.discourseFocus,
    lastResolvedRequest:
      patch.lastResolvedRequest !== undefined
        ? patch.lastResolvedRequest
        : prev.lastResolvedRequest,
    pendingCorrection:
      patch.pendingCorrection !== undefined
        ? patch.pendingCorrection
        : prev.pendingCorrection,
    lastPlanSummary:
      patch.lastPlanSummary !== undefined
        ? patch.lastPlanSummary
        : prev.lastPlanSummary,
    temporalAnchor:
      patch.temporalAnchor !== undefined
        ? patch.temporalAnchor
        : prev.temporalAnchor,
    clarificationHistory:
      patch.clarificationHistory !== undefined
        ? patch.clarificationHistory
        : prev.clarificationHistory,
  }
}

/** Replace collection; clear resource unless keepResource. */
export function setActiveCollection(
  prev: AssistantWorkingContext,
  collection: NonNullable<AssistantWorkingContext['activeCollection']>,
  opts?: { keepResource?: boolean },
): AssistantWorkingContext {
  return {
    ...prev,
    activeCollection: collection,
    activeResource: opts?.keepResource ? prev.activeResource : null,
    activeParticipant: opts?.keepResource ? prev.activeParticipant : null,
    pendingClarification: null,
  }
}

export function setActiveResource(
  prev: AssistantWorkingContext,
  resource: NonNullable<AssistantWorkingContext['activeResource']>,
): AssistantWorkingContext {
  return {
    ...prev,
    activeResource: resource,
    activeParticipant:
      prev.activeParticipant?.weddingId === resource.id
        ? prev.activeParticipant
        : null,
    pendingClarification: null,
  }
}

export function clearCollectionContext(
  prev: AssistantWorkingContext,
): AssistantWorkingContext {
  return {
    ...prev,
    activeCollection: null,
    lastOperation:
      prev.lastOperation?.type === 'direct' ? prev.lastOperation : null,
  }
}

export type { AssistantLastDirectContext, AssistantParticipantCandidate }
