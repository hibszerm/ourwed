/**
 * V4 Capability Registry foundation types.
 * Closed allowlist — no model-invented capability IDs.
 */

import type { AssistantObservation, PlaceFactRole, TimeFactRole } from '../observations/types'
import type { ResolvedTask } from '../resolver/types'
import type { V4FinanceMetric } from '../execution/financeTypes'

/** Closed set of executable V4 capabilities. */
export const V4_CAPABILITY_IDS = [
  'wedding.finance.get',
  'wedding.places.get',
  'wedding.day_plan.get',
  'collection.query',
] as const

export type V4CapabilityId = (typeof V4_CAPABILITY_IDS)[number]

export type CapabilityKind =
  | 'read'
  | 'query'
  | 'derive'
  | 'navigate'
  | 'help'
  | 'prepare_write'

/** Product resources — not DB tables. Includes future slots for typing only. */
export type CapabilityResource =
  | 'wedding'
  | 'session'
  | 'assignment'
  | 'collection'
  | 'route'
  | 'studio'
  | 'help'
  | 'task'
  | 'payment'

export type CapabilityRisk = 'low' | 'medium' | 'high'

export type CapabilitySelectionContext = {
  /** Registry entry exists ≠ execution enabled in this environment. */
  isCapabilityEnabled: (id: V4CapabilityId) => boolean
}

export type WeddingFinanceGetInput = {
  weddingId: string
  metric: V4FinanceMetric
}

export type WeddingPlacesGetInput = {
  weddingId: string
  placeRole: PlaceFactRole
  participantKey: 'p1' | 'p2' | null
}

export type WeddingDayPlanGetInput = {
  weddingId: string
  timeRole: TimeFactRole
  participantKey: 'p1' | 'p2' | null
}

export type CollectionQueryInput = {
  /**
   * G4 primary input: ResolvedTask for direct DomainQuery compile.
   * CollectionQuery is NOT used to build DomainQuery.
   */
  resolved: import('../resolver/types').ResolvedTask
  /**
   * Migration baseline only — comparison diagnostics.
   * May be null when baseline is disabled or unsupported.
   */
  baselineCollectionQuery: import('./collection/collectionQueryContract').CollectionQuery | null
  /**
   * @deprecated Alias of baselineCollectionQuery for older tests.
   * Not primary execution input.
   */
  query?: import('./collection/collectionQueryContract').CollectionQuery | null
}

export type CapabilityInput =
  | WeddingFinanceGetInput
  | WeddingPlacesGetInput
  | WeddingDayPlanGetInput
  | CollectionQueryInput

export type CapabilityInputFailure = {
  ok: false
  reason:
    | 'needs_clarification'
    | 'missing_wedding_id'
    | 'wedding_resource_required'
    | 'invalid_input'
  missingSlot?: 'resource' | 'participant' | 'subject' | 'other'
  safeCode: string
}

export type CapabilityBuildInputResult =
  | { ok: true; input: CapabilityInput }
  | CapabilityInputFailure

/**
 * CapabilityRuntime is intentionally minimal.
 * No elevated service credentials, no identity setters, no SQL, no generic table access.
 */
export type CapabilityRuntime = {
  nowMs: () => number
}

export type CapabilityDefinition = {
  id: V4CapabilityId
  kind: CapabilityKind
  resource: CapabilityResource
  description: string
  riskLevel: CapabilityRisk
  requiresConfirmation: boolean
  canHandle: (
    resolved: ResolvedTask,
    context: CapabilitySelectionContext,
  ) => boolean
  buildInput: (
    resolved: ResolvedTask,
    context: CapabilitySelectionContext,
  ) => CapabilityBuildInputResult
  execute: (
    input: CapabilityInput,
    runtime: CapabilityRuntime,
  ) => Promise<AssistantObservation>
}

export type CapabilitySelection =
  | {
      status: 'selected'
      capability: CapabilityDefinition
      task: ResolvedTask
      enabled: boolean
    }
  | {
      status: 'no_match'
      reason: string
    }
  | {
      status: 'conflict'
      safeCode: 'capability_match_conflict'
      matchedIds: V4CapabilityId[]
    }
  | {
      status: 'needs_clarification'
      missingSlot: 'resource' | 'participant' | 'subject' | 'other'
      safeCode: string
    }
  | {
      status: 'requires_discovery'
      safeCode: string
    }
  | {
      status: 'unsupported'
      safeCode: string
    }
  | {
      status: 'invalid_context'
      safeCode: string
    }

export type CapabilityExecutionResult =
  | {
      status: 'success'
      capabilityId: V4CapabilityId
      observation: AssistantObservation
      selectionMs: number
      executionMs: number
    }
  | {
      status: 'needs_clarification'
      missingSlot: 'resource' | 'participant' | 'subject' | 'other'
      safeCode: string
      selectionMs: number
      executionMs: number
    }
  | {
      status: 'unsupported'
      safeCode: string
      selectionMs: number
      executionMs: number
    }
  | {
      status: 'not_found'
      safeCode: string
      capabilityId?: V4CapabilityId
      selectionMs: number
      executionMs: number
    }
  | {
      status: 'disabled'
      capabilityId: V4CapabilityId
      safeCode: string
      selectionMs: number
      executionMs: number
    }
  | {
      status: 'error'
      safeCode: string
      capabilityId?: V4CapabilityId
      selectionMs: number
      executionMs: number
    }
  | {
      status: 'conflict'
      safeCode: 'capability_match_conflict'
      matchedIds: V4CapabilityId[]
      selectionMs: number
      executionMs: number
    }

/** High-level resolution → capability path may skip unrelated turns. */
export type CapabilityDispatchResult =
  | { handled: false; reason: string }
  | { handled: true; result: CapabilityExecutionResult }
