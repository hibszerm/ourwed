/**
 * PC1 — typed authority decision + runtime mode.
 * Visible ownership stays V3 until a future canary phase unlocks it.
 */

export type AssistantV5Mode =
  | 'off'
  | 'shadow'
  | 'canary'
  | 'authority_read_query'

export type TypedFallbackReason =
  | 'INTERPRETER_SCHEMA_ERROR'
  | 'INTERPRETER_PROVIDER_ERROR'
  | 'REQUEST_FAMILY_NOT_ELIGIBLE'
  | 'UNSUPPORTED_FIELD'
  | 'UNSUPPORTED_OPERATOR'
  | 'UNSUPPORTED_RELATION'
  | 'DOMAIN_QUERY_INVALID'
  | 'EXECUTION_UNAVAILABLE'
  | 'CANARY_INELIGIBLE'
  | 'MODE_NOT_AUTHORITATIVE'
  | 'RUNTIME_MODE_UNAVAILABLE'
  | 'UNSUPPORTED_REQUEST'

export type TypedSafeErrorReason =
  | 'SECURITY_BOUNDARY_VIOLATION'
  | 'WRITE_ATTEMPT_ON_READ_PATH'
  | 'TENANT_SCOPE_FAILURE'
  | 'IMPOSSIBLE_AUTHORITY_STATE'

export type ResolverOutcomeKind =
  | 'bound'
  | 'needs_clarification'
  | 'unsupported'
  | 'interpret_error'
  | 'discarded'
  | 'skipped'

export type DomainQueryStatusKind =
  | 'not_attempted'
  | 'valid'
  | 'invalid'
  | 'executed'
  | 'execution_unavailable'

/**
 * PC1: ownership path is never activated in production.
 * Future canary phases flip this (with tests) — not env alone.
 */
export const PC1_OWNERSHIP_UNLOCKED = false as const

/** Build-shipped max mode in PC1 (code present for shadow diagnostics only). */
export const PC1_BUILD_MAX_MODE: AssistantV5Mode = 'shadow'

export type AssistantAuthorityDecision =
  | {
      kind: 'v5_authority'
      /** Always false under PC1_OWNERSHIP_UNLOCKED. */
      ownershipActive: false
      eligibleForV5Authority: true
      visibleOwner: 'v3'
      requestKind: 'domain_query'
      resolverOutcome: 'bound'
    }
  | {
      kind: 'v5_clarification'
      ownershipActive: false
      eligibleForV5Authority: true
      visibleOwner: 'v3'
      requestKind: 'domain_query'
      clarificationSlot: string
      resolverOutcome: 'needs_clarification'
    }
  | {
      kind: 'v3_fallback'
      visibleOwner: 'v3'
      ownershipActive: false
      eligibleForV5Authority: boolean
      reason: TypedFallbackReason
      requestKind: string | null
      resolverOutcome: ResolverOutcomeKind | null
    }
  | {
      kind: 'safe_error'
      visibleOwner: 'none'
      ownershipActive: false
      eligibleForV5Authority: false
      reason: TypedSafeErrorReason
    }

export type AssistantAuthorityDiagnostic = {
  turnId: string
  authorityDecision: AssistantAuthorityDecision['kind']
  visibleOwner: 'v3' | 'v5' | 'none'
  eligibleForV5Authority: boolean
  requestKind: string | null
  interpreterStatus:
    | 'ok'
    | 'schema_error'
    | 'provider_error'
    | 'invoke_error'
    | 'skipped'
    | 'unsupported'
    | null
  resolverOutcome: ResolverOutcomeKind | null
  domainQueryStatus: DomainQueryStatusKind
  clarificationSlot?: string
  fallbackReason?: TypedFallbackReason
  safeErrorReason?: TypedSafeErrorReason
  outcomeCode?: string
  latencyMs?: number
  effectiveMode: AssistantV5Mode
}
