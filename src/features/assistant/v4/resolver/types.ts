/**
 * V4 Shadow Context + ResolvedTask result types.
 * Deterministic Context Resolver input/output — no LLM, no execution.
 */

import type {
  AssistantTaskSpec,
  TaskOperation,
  TaskQualifiers,
  TaskSubject,
  TaskTemporal,
} from '../taskSpec'
import type { TaskPatch } from '../taskSpec'

export type V4SafeResourceRef = {
  kind: 'wedding' | 'session' | 'assignment'
  id: string
  label?: string
}

export type V4SafeParticipantRef = {
  key: 'p1' | 'p2' | string
  label: string
  weddingId?: string
  role?: 'bride' | 'groom' | null
}

export type V4SafeCandidate = {
  ref: string
  label: string
  kind?: 'wedding' | 'session' | 'participant'
  role?: 'bride' | 'groom' | null
  firstName?: string
  canonicalName?: string
}

export type V4ShadowContext = {
  activeResource: V4SafeResourceRef | null
  activeParticipant: V4SafeParticipantRef | null
  activeCollection: {
    resource: 'weddings' | 'sessions' | 'assignments'
    label?: string
    /**
     * G4/G5: normalized DomainQuery identity — sole semantic SoT for collection.
     * filters are deprecated compatibility-derived views only.
     */
    query?: import('../domainQuery/domainQuery').DomainQuery
    /**
     * @deprecated G5 transitional — derive FROM query via domainQueryToLegacyFilters.
     * Resolver inheritance must not treat this as SoT when query is present.
     */
    filters?: {
      dateRange?: { from: string; to: string } | null
      locationQuery?: string | null
      locationRole?: 'preparations' | 'ceremony' | 'reception' | 'any' | null
    }
    memberIds?: string[]
    resultCount?: number
  } | null
  temporalAnchor: {
    phrase?: string | null
    from?: string | null
    to?: string | null
  } | null
  sequenceCursor: {
    kind: 'day_plan' | 'schedule'
    resourceId?: string | null
    itemRef?: string | null
  } | null
  previousTaskSpec: AssistantTaskSpec | null
  candidates: {
    participants: V4SafeCandidate[]
    weddings: V4SafeCandidate[]
    sessions: V4SafeCandidate[]
  }
}

export function emptyV4ShadowContext(): V4ShadowContext {
  return {
    activeResource: null,
    activeParticipant: null,
    activeCollection: null,
    temporalAnchor: null,
    sequenceCursor: null,
    previousTaskSpec: null,
    candidates: { participants: [], weddings: [], sessions: [] },
  }
}

export type NormalizedTemporalSemantic = {
  phrase: string | null
  kind: TaskTemporal['kind']
  from?: string | null
  to?: string | null
}

export type ResolvedTask = {
  status: 'resolved'
  op: TaskOperation
  subject: TaskSubject | null
  resource: V4SafeResourceRef | null
  participant: V4SafeParticipantRef | null
  temporal: NormalizedTemporalSemantic | null
  qualifiers: TaskQualifiers
  sequence: V4ShadowContext['sequenceCursor']
  collection: V4ShadowContext['activeCollection']
  sourceTaskSpec: AssistantTaskSpec
  /** Fully merged semantic task after inherit/correction (pre-binding). */
  mergedTaskSpec: AssistantTaskSpec
}

export type NeedsClarification = {
  status: 'needs_clarification'
  missingSlot:
    | 'resource'
    | 'participant'
    | 'temporal'
    | 'subject'
    | 'sequence'
  candidates: Array<{
    ref: string
    label: string
    semanticPatch: TaskPatch
  }>
  resumeTask: AssistantTaskSpec
  reason?: string
}

export type RequiresDiscovery = {
  status: 'requires_discovery'
  discovery: {
    kind: 'schedule' | 'wedding_search' | 'session_search' | 'collection'
    temporal?: NormalizedTemporalSemantic | null
    constraints?: {
      subject?: TaskSubject | null
      personQuery?: string | null
      resourceClass?: 'weddings' | 'sessions' | 'assignments' | null
    }
  }
  resumeTask: AssistantTaskSpec
}

export type UnsupportedTask = {
  status: 'unsupported'
  reason: string
  sourceTaskSpec: AssistantTaskSpec
}

export type InvalidContext = {
  status: 'invalid_context'
  reason: string
  sourceTaskSpec: AssistantTaskSpec
}

export type ResolvedTaskResult =
  | ResolvedTask
  | NeedsClarification
  | RequiresDiscovery
  | UnsupportedTask
  | InvalidContext
