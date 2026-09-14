/**
 * IC1 — typed authority decision + runtime mode.
 * Visible V5 ownership only for canary + allowlisted + eligible read slice.
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
  | 'DOMAIN_QUERY_SLICE_INELIGIBLE'
  | 'SEMANTIC_COVERAGE_INCOMPLETE'

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
  | 'slice_ineligible'

/**
 * IC1: ownership path may activate for canary + allowlisted + eligible slice.
 * Not env alone — requires this compile-time unlock + runtime mode + allowlist.
 */
export const IC1_OWNERSHIP_UNLOCKED = true as const

/** @deprecated PC1 name — alias for IC1 unlock. */
export const PC1_OWNERSHIP_UNLOCKED = IC1_OWNERSHIP_UNLOCKED

/** Build-shipped max mode in IC1 (canary; not full authority_read_query). */
export const IC1_BUILD_MAX_MODE: AssistantV5Mode = 'canary'

/** @deprecated PC1 name — alias for IC1 build max. */
export const PC1_BUILD_MAX_MODE = IC1_BUILD_MAX_MODE

export type AssistantAuthorityDecision =
  | {
      kind: 'v5_authority'
      ownershipActive: boolean
      eligibleForV5Authority: true
      visibleOwner: 'v3' | 'v5'
      requestKind: 'domain_query'
      resolverOutcome: 'bound'
    }
  | {
      kind: 'v5_clarification'
      ownershipActive: boolean
      eligibleForV5Authority: true
      visibleOwner: 'v3' | 'v5'
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
  canaryEligible: boolean
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
  /** SC1 — typed coverage; omitted when not assessed. */
  semanticCoverageStatus?: 'complete' | 'incomplete' | 'not_assessed'
  semanticCoverageReasons?: string[]
  outcomeCode?: string
  latencyMs?: number
  effectiveMode: AssistantV5Mode
}
